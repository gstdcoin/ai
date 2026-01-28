package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"time"
)

type BoincService struct {
	db *sql.DB
}

func NewBoincService(db *sql.DB) *BoincService {
	return &BoincService{db: db}
}

// SubmitBatchRequest represents the XML for submit_batch RPC
type SubmitBatchRequest struct {
	XMLName       xml.Name `xml:"submit_batch"`
	Authenticator string   `xml:"authenticator"`
	BatchName     string   `xml:"batch_name"`
	AppName       string   `xml:"app_name"`
	Jobs          []BoincJob `xml:"job"`
}

type BoincJob struct {
	Name        string `xml:"name"`
	InputFile   string `xml:"input_file"`
	CommandLine string `xml:"command_line"`
}

// SubmitBatchResponse represents the response from BOINC
type SubmitBatchResponse struct {
	XMLName xml.Name `xml:"submit_batch_reply"`
	BatchID int      `xml:"batch_id"`
	Error   string   `xml:"error,omitempty"`
}

// QueryBatchRequest represents the query_batches RPC
type QueryBatchRequest struct {
	XMLName       xml.Name `xml:"query_batches"`
	Authenticator string   `xml:"authenticator"`
	BatchID       int      `xml:"batch_id"`
}

type QueryBatchResponse struct {
	XMLName xml.Name `xml:"query_batches_reply"`
	Batches []BatchStatus `xml:"batch"`
}

type BatchStatus struct {
	ID    int `xml:"id"`
	State int `xml:"state"` // 1: in progress, 2: completed, 3: aborted
}

// SubmitToBoinc submits a batch of jobs to a BOINC project
func (s *BoincService) SubmitToBoinc(projectURL, accountKey, appName string, jobs []BoincJob) (int, error) {
	reqBody := SubmitBatchRequest{
		Authenticator: accountKey,
		BatchName:     fmt.Sprintf("GSTD_Batch_%d", time.Now().Unix()),
		AppName:       appName,
		Jobs:          jobs,
	}

	xmlData, err := xml.Marshal(reqBody)
	if err != nil {
		return 0, err
	}

	resp, err := http.Post(fmt.Sprintf("%s/submit_rpc_handler.php", projectURL), "text/xml", bytes.NewBuffer(xmlData))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var reply SubmitBatchResponse
	if err := xml.Unmarshal(body, &reply); err != nil {
		return 0, fmt.Errorf("failed to unmarshal response: %v, body: %s", err, string(body))
	}

	if reply.Error != "" {
		return 0, fmt.Errorf("BOINC error: %s", reply.Error)
	}

	return reply.BatchID, nil
}

// CheckBatchStatus checks the status of a batch on a BOINC project
func (s *BoincService) CheckBatchStatus(projectURL, accountKey string, batchID int) (int, error) {
	reqBody := QueryBatchRequest{
		Authenticator: accountKey,
		BatchID:       batchID,
	}

	xmlData, err := xml.Marshal(reqBody)
	if err != nil {
		return 0, err
	}

	resp, err := http.Post(fmt.Sprintf("%s/query_batches.php", projectURL), "text/xml", bytes.NewBuffer(xmlData))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var reply QueryBatchResponse
	if err := xml.Unmarshal(body, &reply); err != nil {
		return 0, err
	}

	if len(reply.Batches) == 0 {
		return 0, fmt.Errorf("batch not found")
	}

	return reply.Batches[0].State, nil
}

// FetchTaskDetails retrieves information about a specific result/task for bridging
func (s *BoincService) FetchTaskDetails(projectURL, accountKey string, resultID int) (map[string]interface{}, error) {
	// BOINC results can be queried via RPC
	// For a real integration, we'd use get_results or similar
	return map[string]interface{}{
		"project_url": projectURL,
		"result_id":   resultID,
		"status":      "queried",
	}, nil
}

// PollAndFinalizeBoincTasks scans database for pending BOINC tasks and checks their status
func (s *BoincService) PollAndFinalizeBoincTasks(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.finalizeCompletedTasks()
		}
	}
}

func (s *BoincService) finalizeCompletedTasks() {
	// Query DB for tasks with is_boinc=true and status IN ('assigned', 'processing', 'validating')
	rows, err := s.db.Query(`
		SELECT task_id, boinc_project_url, boinc_account_key, boinc_batch_id 
		FROM tasks 
		WHERE is_boinc = true AND status IN ('assigned', 'processing', 'validating')
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var taskID, projectURL, accountKey string
		var batchID int
		if err := rows.Scan(&taskID, &projectURL, &accountKey, &batchID); err != nil {
			continue
		}

		state, err := s.CheckBatchStatus(projectURL, accountKey, batchID)
		if err != nil {
			continue
		}

		if state == 2 { // Completed in BOINC
			// Mark as completed in GSTD
			// This will trigger the payout logic (refer to ResultService or TaskService)
			_, _ = s.db.Exec("UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE task_id = $1", taskID)
		} else if state == 3 { // Aborted in BOINC
			_, _ = s.db.Exec("UPDATE tasks SET status = 'failed' WHERE task_id = $1", taskID)
		}
	}
}
