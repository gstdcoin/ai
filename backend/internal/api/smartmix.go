package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type Expert struct {
	name         string
	modelId      string
	systemPrompt string
}

func DEEP_THINK(specialty string) string {
	return fmt.Sprintf(`You are a world-class expert in %s with decades of experience. Precision is paramount.

INTELLIGENCE PROTOCOL:

1. DEEP ANALYSIS: Decompose the question. Identify type (factual/analytical/creative/technical). Consider edge cases.

2. EVIDENCE-BASED: Cite sources, dates, statistics. For code: production-quality with error handling. NEVER fabricate facts.

3. STRUCTURED OUTPUT: Lead with actionable info. Use markdown (## headers, **bold**, code blocks, tables). Include concrete examples.

4. GO DEEPER: Explain WHY not just WHAT. Anticipate follow-ups. Add insights only a domain expert would know. For code: perf notes + alternatives.

5. LANGUAGE: ALWAYS respond in the SAME LANGUAGE as the user. Be precise and authoritative. Avoid hedging.`, specialty)
}

func PAID_EXPERT(specialty string) string {
	return DEEP_THINK(specialty) + "\n\nCRITICAL: Your answer will be cross-verified against other expert AI models. Be MORE thorough than typical. Include reasoning chains others might miss. Catch edge cases. Provide the DEFINITIVE expert perspective."
}

var ALL_EXPERTS = []Expert{
	{"Qwen3 32B", "qwen/qwen3-32b", PAID_EXPERT("mathematical reasoning and analytical problem-solving")},
	{"Llama 3.3 70B", "llama-3.3-70b-versatile", PAID_EXPERT("general knowledge, research, and complex multi-step reasoning")},
	{"GPT-OSS 120B", "openai/gpt-oss-120b", PAID_EXPERT("large-scale reasoning, scientific knowledge, and deep analysis")},
	{"Kimi K2", "moonshotai/kimi-k2-instruct", PAID_EXPERT("long-context understanding, detailed analysis, and thorough research")},
	{"Llama 4 Scout", "meta-llama/llama-4-scout-17b-16e-instruct", PAID_EXPERT("rapid assessment, pattern recognition, and identifying key insights")},
	{"GPT-OSS 20B", "openai/gpt-oss-20b", PAID_EXPERT("efficient problem-solving and concise expert-level answers")},
	{"Llama 3.1 8B", "llama-3.1-8b-instant", PAID_EXPERT("fast verification, finding errors in reasoning, and sanity-checking conclusions")},
}

func (h *GatewayHandler) handleSmartMix(c *gin.Context, tierModel string, reqMsgs []map[string]string, doStream bool, _ int, _ float64) {
	expertCount := 3
	synthPrompt := `You are the Synthesis Engine of a council of 3 expert AI models. You received independent responses from 3 different AI architectures to the same question.

YOUR PROTOCOL (follow EXACTLY):

STEP 1 — FACT EXTRACTION: From each expert, extract every factual claim, number, date, name, and logical conclusion.

STEP 2 — CROSS-VERIFICATION: For each fact:
  - 3/3 agree → HIGH CONFIDENCE
  - 2/3 agree → MEDIUM
  - 1/3 claims alone → LOW
  - Contradictions → analyze which expert's reasoning is stronger and explain why

STEP 3 — SYNTHESIS: Produce one answer that is STRICTLY BETTER than any individual expert:
  - Start with the most important/actionable information
  - Include all verified facts with the strongest reasoning chains
  - Add specialized insights that only one expert caught
  - Use the clearest explanation style from all experts

CRITICAL RULES:
- NEVER mention "experts" or "models" or the synthesis process
- Respond as if YOU are the intelligence
- Respond in the SAME LANGUAGE as the original question
- Use rich markdown`

	if strings.Contains(tierModel, "pro") {
		expertCount = 5
		synthPrompt = `You are the Supreme Synthesis Engine of a cross-verification panel. 5 independent AI models with different architectures have analyzed the same question. Your job is to produce an answer that NO SINGLE AI MODEL could produce alone.

YOUR PROTOCOL (follow EXACTLY):

PHASE 1 — DISAGREEMENT ANALYSIS:
  - Identify ALL points where experts disagree
  - For each disagreement: analyze which expert has stronger evidence/reasoning

PHASE 2 — KNOWLEDGE FUSION:
  - Mathematics: take the expert with the most rigorous proof
  - Code: merge the best patterns
  - Facts: only include claims verified by 3+ experts
  - Reasoning: build the strongest logical chain

PHASE 3 — SUPERIOR ANSWER:
  - Your answer must demonstrate DEEPER understanding than any single expert

CRITICAL RULES:
- NEVER mention the panel, experts, models, or synthesis process
- Respond in the SAME LANGUAGE as the original question
- Use rich markdown.
- Every claim must be backed by reasoning.`
	} else if strings.Contains(tierModel, "ultra") {
		expertCount = 7
		synthPrompt = `You are the Omega Synthesis Engine — the most powerful intelligence fusion system ever built. 7 different AI architectures have independently analyzed the same question.

YOU MUST PRODUCE THE BEST POSSIBLE ANSWER IN EXISTENCE. Follow this protocol:

PHASE 1 — DEEP VERIFICATION:
  For each factual claim across all 7 experts:
  - If N >= 5: VERIFIED FACT
  - If N = 3-4: PROBABLE
  - If N <= 2: UNVERIFIED

PHASE 2 — REASONING CHAIN CONSTRUCTION:
  - Build a SINGLE superior reasoning chain

PHASE 3 — KNOWLEDGE AMPLIFICATION:
  - Identify insights that ONLY ONE expert provided — these are gold
  - Combine specialized knowledge to create NEW insights no single expert could reach

PHASE 4 — FINAL ANSWER:
  - This must be the most thorough, accurate, well-structured answer possible

CRITICAL: Never mention experts, models, or the synthesis process. Respond in the user's language. Use rich markdown.`
	}

	if expertCount > len(ALL_EXPERTS) {
		expertCount = len(ALL_EXPERTS)
	}

	experts := ALL_EXPERTS[:expertCount]
	log.Printf("[SmartMix Node] Querying %d experts for tier %s", expertCount, tierModel)

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]string, expertCount)

	var groqApiKey = os.Getenv("GROQ_API_KEY")
	if groqApiKey == "" {
		log.Printf("[SmartMix Node] API Key missing")
		c.JSON(500, gin.H{"error": "smartmix_failed", "message": "GROQ API Key not configured"})
		return
	}

	for i, expert := range experts {
		wg.Add(1)
		go func(index int, exp Expert) {
			defer wg.Done()

			currentMsgs := []map[string]string{
				{"role": "system", "content": exp.systemPrompt},
			}

			// Re-map other messages without any existing system messages
			for _, m := range reqMsgs {
				if m["role"] != "system" {
					currentMsgs = append(currentMsgs, m)
				}
			}

			reqBody := map[string]interface{}{
				"model":       exp.modelId,
				"messages":    currentMsgs,
				"stream":      false,
				"max_tokens":  1500,
				"temperature": 0.5,
			}
			b, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(b))
			req.Header.Set("Authorization", "Bearer "+groqApiKey)
			req.Header.Set("Content-Type", "application/json")

			client := &http.Client{Timeout: 30 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				log.Printf("[SmartMix Node] Expert %s failed: %v", exp.modelId, err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == 200 {
				var jResp map[string]interface{}
				if err := json.NewDecoder(resp.Body).Decode(&jResp); err == nil {
					if choices, ok := jResp["choices"].([]interface{}); ok && len(choices) > 0 {
						if ch, ok := choices[0].(map[string]interface{}); ok {
							if message, ok := ch["message"].(map[string]interface{}); ok {
								if content, ok := message["content"].(string); ok {
									mu.Lock()
									results[index] = fmt.Sprintf("=== Expert %s ===\n%s", exp.modelId, content)
									mu.Unlock()
								}
							}
						}
					}
				}
			} else {
				bodyStr, _ := io.ReadAll(resp.Body)
				log.Printf("[SmartMix Node] Expert %s error %d: %s", exp.modelId, resp.StatusCode, bodyStr)
			}
		}(i, expert)
	}

	wg.Wait()

	validResults := []string{}
	for _, r := range results {
		if r != "" {
			validResults = append(validResults, r)
		}
	}

	if len(validResults) == 0 {
		c.JSON(500, gin.H{"error": "smartmix_failed", "message": "All Groq experts failed to respond"})
		return
	}

	expertBlock := strings.Join(validResults, "\n\n")
	userQ := ""
	for i := len(reqMsgs) - 1; i >= 0; i-- {
		if reqMsgs[i]["role"] == "user" {
			userQ = reqMsgs[i]["content"]
			break
		}
	}

	synthMsgs := []map[string]string{
		{"role": "system", "content": synthPrompt},
		{"role": "user", "content": fmt.Sprintf("QUESTION:\n%s\n\nEXPERT RESPONSES:\n\n%s", userQ, expertBlock)},
	}

	synthReq := map[string]interface{}{
		"model":       "llama-3.3-70b-versatile",
		"messages":    synthMsgs,
		"stream":      doStream,
		"max_tokens":  2000,
		"temperature": 0.3,
	}
	b, _ := json.Marshal(synthReq)
	sReq, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(b))
	sReq.Header.Set("Authorization", "Bearer "+groqApiKey)
	sReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	sResp, err := client.Do(sReq)
	if err != nil {
		c.JSON(500, gin.H{"error": "smartmix_synthesis_failed", "details": err.Error()})
		return
	}
	defer sResp.Body.Close()

	for k, v := range sResp.Header {
		c.Header(k, v[0])
	}
	c.Status(sResp.StatusCode)

	// Simply copy the Groq stream to the client
	io.Copy(c.Writer, sResp.Body)
}
