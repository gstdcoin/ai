package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tlb"
)

func main() {
	seed := strings.TrimSpace(os.Getenv("TON_MNEMONIC"))
	if seed == "" {
		fmt.Fprintln(os.Stderr, "Set TON_MNEMONIC (24 words) — never commit real seeds")
		os.Exit(1)
	}

	client := liteclient.NewConnectionPool()
	ctx := context.Background()
	err := client.AddConnectionsFromConfigUrl(ctx, "https://ton-blockchain.github.io/global.config.json")
	if err != nil {
		panic(err)
	}

	api := ton.NewAPIClient(client)

	words := strings.Fields(seed)
    
    hl, err := wallet.FromSeedWithOptions(api, words, wallet.ConfigHighloadV3{
        MessageTTL: 300,
    })
    if err != nil { panic(err) }
    
    fmt.Println("Address:", hl.WalletAddress().String())
    
    amt := tlb.MustFromTON("0.01")
    err = hl.Transfer(ctx, hl.WalletAddress(), amt, "Init", true)
    if err != nil {
        fmt.Println("Error:", err)
    } else {
        fmt.Println("✅ Message sent!")
    }
}
