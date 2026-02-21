package hive

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestXORDistance(t *testing.T) {
	var a, b NodeID
	a[0] = 0xFF
	b[0] = 0x00
	dist := XORDistance(a, b)
	assert.Equal(t, byte(0xFF), dist[0])

	// Same node → distance 0
	dist = XORDistance(a, a)
	for _, d := range dist {
		assert.Equal(t, byte(0), d)
	}
}

func TestXORDistanceSymmetry(t *testing.T) {
	var a, b NodeID
	a[0] = 0x12
	a[1] = 0x34
	b[0] = 0xAB
	b[1] = 0xCD

	distAB := XORDistance(a, b)
	distBA := XORDistance(b, a)
	assert.Equal(t, distAB, distBA, "XOR distance must be symmetric")
}

func TestKademliaDHTAddAndFind(t *testing.T) {
	var selfID NodeID
	selfID[0] = 0x01
	dht := NewKademliaDHT(selfID)

	// Add some contacts
	for i := byte(0); i < 10; i++ {
		var contactID NodeID
		contactID[0] = i + 10
		dht.AddContact(Contact{
			ID:      contactID,
			Address: "127.0.0.1:" + string(rune('0'+i)),
			Region:  "us-east",
		})
	}

	// Find K closest
	var target NodeID
	target[0] = 0x15
	closest := dht.KClosest(target, 5)
	assert.LessOrEqual(t, len(closest), 5)
}

func TestKademliaDHTKBucketUpdate(t *testing.T) {
	var selfID NodeID
	dht := NewKademliaDHT(selfID)

	var contactID NodeID
	contactID[0] = 0xFF

	// Add same contact twice → should update, not duplicate
	dht.AddContact(Contact{ID: contactID, Address: "addr1"})
	dht.AddContact(Contact{ID: contactID, Address: "addr2"})

	closest := dht.KClosest(contactID, K)
	count := 0
	for _, c := range closest {
		if c.ID == contactID {
			count++
		}
	}
	assert.Equal(t, 1, count, "No duplicate contacts")
}

func TestKademliaDHTStoreMeta(t *testing.T) {
	var selfID NodeID
	dht := NewKademliaDHT(selfID)

	var contentID ContentID
	contentID[0] = 0xAB

	meta := &BlockMeta{
		ContentID:  contentID,
		TotalSize:  1024,
		BlockType:  KnowFactual,
		TrustScore: 0.9,
	}

	dht.StoreMeta(contentID, meta)

	ctx := context.Background()
	found, err := dht.FindMeta(ctx, contentID)
	assert.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, int64(1024), found.TotalSize)
	assert.Equal(t, 0.9, found.TrustScore)
}

func TestKademliaDHTFindMetaNotFound(t *testing.T) {
	var selfID NodeID
	dht := NewKademliaDHT(selfID)

	var contentID ContentID
	contentID[0] = 0xDE

	ctx := context.Background()
	_, err := dht.FindMeta(ctx, contentID)
	assert.Error(t, err)
}

func TestCompareNodeID(t *testing.T) {
	var a, b NodeID
	a[0] = 0x01
	b[0] = 0x02

	assert.Equal(t, -1, compareNodeID(a, b))
	assert.Equal(t, 1, compareNodeID(b, a))
	assert.Equal(t, 0, compareNodeID(a, a))
}

func TestKademliaDHTKBucketOverflow(t *testing.T) {
	var selfID NodeID
	dht := NewKademliaDHT(selfID)

	// Add K+5 contacts in the same bucket range
	for i := 0; i < K+5; i++ {
		var cID NodeID
		cID[0] = 0xFF // all go to same bucket (far from selfID)
		cID[1] = byte(i)
		dht.AddContact(Contact{
			ID:      cID,
			Address: "1.2.3.4:100",
		})
	}

	// K-closest should return at most K
	var target NodeID
	target[0] = 0xFF
	closest := dht.KClosest(target, K)
	assert.LessOrEqual(t, len(closest), K)
}
