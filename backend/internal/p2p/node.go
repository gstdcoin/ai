package p2p

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"

	"github.com/libp2p/go-libp2p"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
)

// SwarmNode wraps a libp2p host and pubsub router.
type SwarmNode struct {
	Host     host.Host
	PubSub   *pubsub.PubSub
	Topic    *pubsub.Topic
	Sub      *pubsub.Subscription
	ctx      context.Context
	cancel   context.CancelFunc
}

// discoveryNotifee gets notified when we find a new peer via mDNS.
type discoveryNotifee struct {
	h host.Host
}

// HandlePeerFound connects to peers discovered via mDNS.
func (n *discoveryNotifee) HandlePeerFound(pi peer.AddrInfo) {
	if pi.ID == n.h.ID() {
		return
	}
	err := n.h.Connect(context.Background(), pi)
	if err != nil {
		log.Printf("⚠️ P2P: Error connecting to %s: %s\n", pi.ID.String(), err)
	} else {
		log.Printf("🌐 P2P: Connected to Swarm Peer: %s\n", pi.ID.String())
	}
}

// NewSwarmNode creates a new P2P node and joins the "gstd-swarm" network
func NewSwarmNode() *SwarmNode {
	ctx, cancel := context.WithCancel(context.Background())

	// Generate a random Ed25519 keypair for the libp2p node
	priv, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		log.Printf("⚠️ P2P: failed to generate key: %v", err)
		cancel()
		return nil
	}

	// Create libp2p Host (listening on random port or default)
	h, err := libp2p.New(
		libp2p.Identity(priv),
		libp2p.ListenAddrStrings("/ip4/0.0.0.0/tcp/0"), // Listen on random available port
	)
	if err != nil {
		log.Printf("⚠️ P2P: failed to create host: %v", err)
		cancel()
		return nil
	}

	log.Printf("🚀 P2P Node initialized with ID: %s", h.ID().String())

	// Set up GossipSub routing
	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		log.Printf("⚠️ P2P: failed to create pubsub: %v", err)
		cancel()
		return nil
	}

	// Join the default GSTD swarm topic
	topicName := "gstd-layer1-swarm"
	topic, err := ps.Join(topicName)
	if err != nil {
		log.Printf("⚠️ P2P: failed to join topic: %v", err)
		cancel()
		return nil
	}

	// Subscribe to the topic
	sub, err := topic.Subscribe()
	if err != nil {
		log.Printf("⚠️ P2P: failed to subscribe: %v", err)
		cancel()
		return nil
	}

	// Start mDNS discovery (local network auto-discovery)
	// Important for docker-compose setups where nodes are on the same bridge network
	mdnsService := mdns.NewMdnsService(h, "gstd-discovery", &discoveryNotifee{h: h})
	if err := mdnsService.Start(); err != nil {
		log.Printf("⚠️ P2P: failed to start mDNS discovery: %v", err)
	} else {
		log.Printf("📡 P2P mDNS Discovery Started for 'gstd-discovery'")
	}

	node := &SwarmNode{
		Host:   h,
		PubSub: ps,
		Topic:  topic,
		Sub:    sub,
		ctx:    ctx,
		cancel: cancel,
	}

	return node
}

// Broadcast sends a message to the Swarm
func (n *SwarmNode) Broadcast(payload []byte) error {
	if n.Topic == nil {
		return fmt.Errorf("P2P topic not initialized")
	}
	return n.Topic.Publish(n.ctx, payload)
}

// Close shuts down the node
func (n *SwarmNode) Close() error {
	n.cancel()
	if n.Topic != nil {
		n.Topic.Close()
	}
	return n.Host.Close()
}
