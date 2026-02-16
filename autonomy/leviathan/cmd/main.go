// Standalone Leviathan process. Run with: go run .
// Requires: LEVIATHAN_ENABLED=true
// Optional: LEVIATHAN_TELEGRAM_BOT_TOKEN, LEVIATHAN_TELEGRAM_CHAT_ID
package main

import (
	"autonomy/leviathan"
	"log"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	leviathan.RunStandalone()
}
