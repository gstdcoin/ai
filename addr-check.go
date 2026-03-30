package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

func main() {
	seed := strings.TrimSpace(os.Getenv("TON_MNEMONIC"))
	if seed == "" {
		fmt.Fprintln(os.Stderr, "Set TON_MNEMONIC (24 words, space-separated) — never commit real seeds")
		os.Exit(1)
	}

	client := liteclient.NewConnectionPool()
	api := ton.NewAPIClient(client)

	words := strings.Fields(seed)
	
	hl, _ := wallet.FromSeed(api, words, wallet.HighloadV3)
	fmt.Println("HLV3:", hl.WalletAddress().String())
    
    std, _ := wallet.FromSeed(api, words, wallet.V3R2)
	fmt.Println("V3R2:", std.WalletAddress().String())
}
