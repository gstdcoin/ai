package main

import (
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
)

// SubmitBatchResponse represents the response from BOINC
type SubmitBatchResponse struct {
	XMLName xml.Name `xml:"submit_batch_reply"`
	BatchID int      `xml:"batch_id"`
	Error   string   `xml:"error,omitempty"`
}

// QueryBatchResponse represents the response from BOINC
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

func main() {
	port := "8111"
	
	// Prepare mock
	http.HandleFunc("/submit_rpc_handler.php", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received submit_rpc_handler.php request")
		
		// Respond with a dummy batch ID
		resp := SubmitBatchResponse{
			BatchID: 1001,
		}
		
		w.Header().Set("Content-Type", "text/xml")
		xml.NewEncoder(w).Encode(resp)
	})

	http.HandleFunc("/query_batches.php", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received query_batches.php request")
		
		// Respond with Completed status (State=2) and CanonicalResultID set (success)
		resp := QueryBatchResponse{
			Batches: []BatchStatus{
				{
					ID:    1001,
					State: 2, // Completed
					Jobs: []JobStatus{
						{
							ID:                5001,
							CanonicalResultID: 9999, // Indicate success result available
							Outcome:           1,    // Success
						},
					},
				},
			},
		}

		w.Header().Set("Content-Type", "text/xml")
		xml.NewEncoder(w).Encode(resp)
	})
	
	// Health check for verifying server is running
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	fmt.Printf("Starting Mock BOINC Server on :%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
