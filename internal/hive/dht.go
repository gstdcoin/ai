// Package hive implements Kademlia-based DHT routing for Hive Memory.
// O(log N) lookup efficiency — at N=1,000,000 nodes, max 20 hops.
package hive

import (
	"context"
	"fmt"
	"log"
	"sort"
	"sync"
)

const (
	K         = 20  // k-bucket size (Kademlia standard)
	Alpha     = 3   // concurrency parameter
	IDBits    = 256 // NodeID bit length (SHA-256)
	MaxRounds = 20  // max iterative lookup rounds
)

// ─── DHT ────────────────────────────────────────────────────────────────────

// KademliaDHT implements distributed hash table routing.
type KademliaDHT struct {
	selfID  NodeID
	buckets [IDBits]KBucket
	meta    map[ContentID]*BlockMeta
	mu      sync.RWMutex
}

// KBucket holds K contacts for a specific XOR distance range.
type KBucket struct {
	Contacts []Contact
	mu       sync.RWMutex
}

// Contact represents a known peer node.
type Contact struct {
	ID       NodeID `json:"id"`
	Address  string `json:"address"` // ip:port
	Region   string `json:"region"`
	LastSeen int64  `json:"last_seen"`
}

// BlockMeta holds metadata about where a KnowledgeBlock's shards live.
type BlockMeta struct {
	ContentID  ContentID   `json:"content_id"`
	Shards     []ShardInfo `json:"shards"`
	TotalSize  int64       `json:"total_size"`
	BlockType  KnowType    `json:"block_type"`
	TrustScore float64     `json:"trust_score"`
}

// NewKademliaDHT creates a new DHT instance.
func NewKademliaDHT(selfID NodeID) *KademliaDHT {
	return &KademliaDHT{
		selfID: selfID,
		meta:   make(map[ContentID]*BlockMeta),
	}
}

// ─── XOR Distance ───────────────────────────────────────────────────────────

// XORDistance computes the XOR metric between two node IDs.
func XORDistance(a, b NodeID) NodeID {
	var result NodeID
	for i := range a {
		result[i] = a[i] ^ b[i]
	}
	return result
}

// bucketIndex returns which k-bucket a node belongs to (based on leading zeros in XOR distance).
func (d *KademliaDHT) bucketIndex(target NodeID) int {
	dist := XORDistance(d.selfID, target)
	for i := 0; i < IDBits; i++ {
		byteIdx := i / 8
		bitIdx := 7 - (i % 8)
		if dist[byteIdx]&(1<<uint(bitIdx)) != 0 {
			return IDBits - 1 - i
		}
	}
	return 0
}

// ─── Routing Table Operations ───────────────────────────────────────────────

// AddContact adds or updates a contact in the routing table.
func (d *KademliaDHT) AddContact(contact Contact) {
	idx := d.bucketIndex(contact.ID)
	bucket := &d.buckets[idx]

	bucket.mu.Lock()
	defer bucket.mu.Unlock()

	// Check if contact already exists
	for i, c := range bucket.Contacts {
		if c.ID == contact.ID {
			// Move to end (most recently seen)
			bucket.Contacts = append(bucket.Contacts[:i], bucket.Contacts[i+1:]...)
			bucket.Contacts = append(bucket.Contacts, contact)
			return
		}
	}

	// Add if bucket not full
	if len(bucket.Contacts) < K {
		bucket.Contacts = append(bucket.Contacts, contact)
		return
	}

	// Bucket full: evict least recently seen (standard Kademlia behavior)
	bucket.Contacts = append(bucket.Contacts[1:], contact)
}

// KClosest returns the K closest nodes to a target ID.
func (d *KademliaDHT) KClosest(target NodeID, k int) []Contact {
	var allContacts []Contact

	for i := range d.buckets {
		d.buckets[i].mu.RLock()
		allContacts = append(allContacts, d.buckets[i].Contacts...)
		d.buckets[i].mu.RUnlock()
	}

	// Sort by XOR distance to target
	sort.Slice(allContacts, func(i, j int) bool {
		distI := XORDistance(allContacts[i].ID, target)
		distJ := XORDistance(allContacts[j].ID, target)
		return compareNodeID(distI, distJ) < 0
	})

	if len(allContacts) > k {
		allContacts = allContacts[:k]
	}
	return allContacts
}

// ─── Iterative Lookup ───────────────────────────────────────────────────────

// FindMeta performs iterative DHT lookup for block metadata.
func (d *KademliaDHT) FindMeta(ctx context.Context, id ContentID) (*BlockMeta, error) {
	// First check local store
	d.mu.RLock()
	if meta, ok := d.meta[id]; ok {
		d.mu.RUnlock()
		return meta, nil
	}
	d.mu.RUnlock()

	target := NodeID(id)
	closest := d.KClosest(target, K)

	if len(closest) == 0 {
		return nil, fmt.Errorf("no peers in routing table")
	}

	queried := make(map[NodeID]bool)

	for round := 0; round < MaxRounds; round++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		var newContacts []Contact
		queriedThisRound := 0

		for _, node := range closest {
			if queried[node.ID] {
				continue
			}
			queried[node.ID] = true
			queriedThisRound++

			// In production: actual gRPC call to node
			meta, contacts, err := d.queryNode(ctx, node, id)
			if err != nil {
				continue
			}

			if meta != nil {
				// Found metadata!
				d.mu.Lock()
				d.meta[id] = meta
				d.mu.Unlock()
				log.Printf("[DHT] Found meta for %s after %d rounds", id, round+1)
				return meta, nil
			}

			newContacts = append(newContacts, contacts...)

			if queriedThisRound >= Alpha {
				break
			}
		}

		if queriedThisRound == 0 {
			break // exhausted all known peers
		}

		// Merge new contacts into closest set
		for _, c := range newContacts {
			if !queried[c.ID] {
				closest = append(closest, c)
			}
		}

		// Re-sort by distance
		sort.Slice(closest, func(i, j int) bool {
			distI := XORDistance(closest[i].ID, target)
			distJ := XORDistance(closest[j].ID, target)
			return compareNodeID(distI, distJ) < 0
		})
		if len(closest) > K {
			closest = closest[:K]
		}
	}

	return nil, ErrNotFound
}

// StoreMeta stores block metadata in the DHT.
func (d *KademliaDHT) StoreMeta(id ContentID, meta *BlockMeta) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.meta[id] = meta
}

// queryNode simulates a DHT FIND_VALUE query to a remote node.
func (d *KademliaDHT) queryNode(ctx context.Context, node Contact, id ContentID) (*BlockMeta, []Contact, error) {
	// In production: gRPC call to node.Address
	// Returns either the metadata or closer nodes
	return nil, nil, fmt.Errorf("remote query not implemented — use gRPC client")
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// compareNodeID lexicographically compares two NodeIDs.
func compareNodeID(a, b NodeID) int {
	for i := range a {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

// ErrNotFound is returned when a block is not found in the DHT.
var ErrNotFound = fmt.Errorf("block not found in DHT")
