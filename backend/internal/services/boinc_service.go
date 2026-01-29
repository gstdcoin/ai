package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type BoincService struct {
	db              *sql.DB
	securityService *BoincSecurityService
}

func NewBoincService(db *sql.DB) *BoincService {
	return &BoincService{
		db:              db,
		securityService: NewBoincSecurityService(),
	}
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
	XMLName xml.Name      `xml:"query_batches_reply"`
	Batches []BatchStatus `xml:"batch"`
}

type BatchStatus struct {
	ID    int       `xml:"id"`
	State int       `xml:"state"` // 1: in progress, 2: completed, 3: aborted
	Jobs  []JobStatus `xml:"job"`
}

type JobStatus struct {
	ID                int `xml:"id"`
	CanonicalResultID int `xml:"canonical_result_id"`
	Outcome           int `xml:"outcome"` // 1: success, 2: error, etc.
}

// SubmitToBoinc submits a batch of jobs to a BOINC project with retry logic
func (s *BoincService) SubmitToBoinc(projectURL, accountKey string, appName string, jobs []BoincJob) (int, error) {
	// AccountKey is already decrypted if called from PollAndFinalize
	// But if called from API, it's plain. 
	// The requirement says: "ключ дешифруется в оперативной памяти и сразу очищается после использования"
	
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

	var batchID int
	var lastErr error
	for i := 0; i < 3; i++ {
		resp, err := http.Post(fmt.Sprintf("%s/submit_rpc_handler.php", projectURL), "text/xml", bytes.NewBuffer(xmlData))
		if err != nil {
			lastErr = err
			time.Sleep(2 * time.Second)
			continue
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var reply SubmitBatchResponse
		if err := xml.Unmarshal(body, &reply); err != nil {
			lastErr = fmt.Errorf("failed to unmarshal response: %v", err)
			continue
		}

		if reply.Error != "" {
			return 0, fmt.Errorf("BOINC error: %s", reply.Error)
		}

		batchID = reply.BatchID
		lastErr = nil
		break
	}

	if lastErr != nil {
		return 0, fmt.Errorf("BOINC submission failed after retries: %v", lastErr)
	}

	return batchID, nil
}

// CheckBatchStatus checks the status of a batch on a BOINC project with retry logic
func (s *BoincService) CheckBatchStatus(projectURL, accountKey string, batchID int) (*BatchStatus, error) {
	reqBody := QueryBatchRequest{
		Authenticator: accountKey,
		BatchID:       batchID,
	}

	xmlData, err := xml.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	var batchStatus *BatchStatus
	var lastErr error
	for i := 0; i < 3; i++ {
		resp, err := http.Post(fmt.Sprintf("%s/query_batches.php", projectURL), "text/xml", bytes.NewBuffer(xmlData))
		if err != nil {
			lastErr = err
			time.Sleep(2 * time.Second)
			continue
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var reply QueryBatchResponse
		if err := xml.Unmarshal(body, &reply); err != nil {
			lastErr = fmt.Errorf("failed to unmarshal query response: %v", err)
			continue
		}

		if len(reply.Batches) == 0 {
			lastErr = fmt.Errorf("batch not found")
			continue
		}

		batchStatus = &reply.Batches[0]
		lastErr = nil
		break
	}

	if lastErr != nil {
		return nil, fmt.Errorf("BOINC status check failed after retries: %v", lastErr)
	}

	return batchStatus, nil
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
		WHERE is_boinc = true AND status IN ('pending', 'assigned', 'processing', 'validating')
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var taskID, projectURL, encryptedKey string
		var batchID int
		if err := rows.Scan(&taskID, &projectURL, &encryptedKey, &batchID); err != nil {
			continue
		}

		// Security: Decrypt key in memory
		accountKeyBytes, err := s.securityService.DecryptAccountKey(encryptedKey)
		if err != nil {
			log.Printf("[SECURITY] Failed to decrypt BOINC account key for task %s", taskID)
			continue
		}
		accountKey := string(accountKeyBytes)

		batchStatus, err := s.CheckBatchStatus(projectURL, accountKey, batchID)
		
		// Immediately clear key from memory
		s.securityService.ClearMemory(accountKeyBytes)
		accountKey = "" // Go strings are immutable but clearing the source helps

		if err != nil {
			log.Println(s.securityService.LogSafe("[BOINC] Task %s status check failed: %v", taskID, err))
			continue
		}

		// Requirement: Completed ONLY if state=2 (Completed) and returns valid canonical_result_id
		if batchStatus.State == 2 {
			hasCanonical := false
			for _, job := range batchStatus.Jobs {
				if job.CanonicalResultID > 0 {
					hasCanonical = true
					break
				}
			}

			if hasCanonical {
				// Mark as completed in GSTD
				_, _ = s.db.Exec("UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE task_id = $1", taskID)
				log.Println(s.securityService.LogSafe("✅ BOINC Task %s completed successfully (Batch %d)", taskID, batchID))
			} else {
				log.Println(s.securityService.LogSafe("⚠️  BOINC Task %s state is completed but no canonical_result_id yet", taskID))
			}
		} else if batchStatus.State == 3 { // Aborted in BOINC
			_, _ = s.db.Exec("UPDATE tasks SET status = 'failed' WHERE task_id = $1", taskID)
			log.Println(s.securityService.LogSafe("❌ BOINC Task %s aborted in BOINC project", taskID))
		}
	}
}

// GetBoincStats returns aggregated statistics for BOINC tasks
func (s *BoincService) GetBoincStats(ctx context.Context) (map[string]interface{}, error) {
	var activeTasks, completed24h int
	var successRate float64
	var totalProjects int

	// 1. Count active tasks
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE is_boinc = true AND status IN ('pending', 'assigned', 'processing', 'validating')").Scan(&activeTasks)
	if err != nil {
		return nil, err
	}

	// 2. Count completed last 24h
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE is_boinc = true AND status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'").Scan(&completed24h)
	if err != nil {
		return nil, err
	}

	// 3. Success rate calculation
	err = s.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(
				CAST(COUNT(*) FILTER (WHERE status = 'completed') AS FLOAT) / 
				NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0),
				1.0
			)
		FROM tasks WHERE is_boinc = true
	`).Scan(&successRate)
	if err != nil {
		successRate = 1.0
	}

	// 4. Unique projects
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT boinc_project_url) FROM tasks WHERE is_boinc = true").Scan(&totalProjects)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"active_tasks":    activeTasks,
		"completed_24h":   completed24h,
		"success_rate":    successRate * 100,
		"active_projects": totalProjects,
		"status":          "healthy",
		"last_update":      time.Now().Format(time.RFC3339),
	}, nil
}
