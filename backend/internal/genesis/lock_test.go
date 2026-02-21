package genesis

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenesisLockNewCreation(t *testing.T) {
	lock := NewGenesisLock("test-node", "/tmp/test-manifest.json")
	assert.NotNil(t, lock)
	assert.False(t, lock.IsVerified())
	assert.Nil(t, lock.GetManifest())
}

func TestGenesisLockGenerateManifest(t *testing.T) {
	tmpDir := t.TempDir()
	manifestPath := filepath.Join(tmpDir, "genesis-manifest.json")

	lock := NewGenesisLock("test-node", manifestPath)
	err := lock.LoadManifest()
	// Should succeed even if no files found (generates empty manifest)
	assert.NoError(t, err)

	manifest := lock.GetManifest()
	assert.NotNil(t, manifest)
	assert.Equal(t, "1.0.0", manifest.Version)

	// Manifest file should be written to disk
	_, err = os.Stat(manifestPath)
	assert.NoError(t, err)
}

func TestGenesisLockVerifyWithManifest(t *testing.T) {
	tmpDir := t.TempDir()
	manifestPath := filepath.Join(tmpDir, "genesis-manifest.json")

	// Create a test file to verify
	testFile := filepath.Join(tmpDir, "testbin")
	err := os.WriteFile(testFile, []byte("test binary content"), 0644)
	require.NoError(t, err)

	hash, err := sha256File(testFile)
	require.NoError(t, err)

	lock := NewGenesisLock("test-node", manifestPath)
	lock.manifest = &GenesisManifest{
		Version: "1.0.0",
		Binaries: map[string]string{
			testFile: hash,
		},
	}

	result, err := lock.Verify()
	require.NoError(t, err)
	assert.True(t, result.Verified)
	assert.Empty(t, result.Mismatches)
	assert.Equal(t, "1.0.0", result.Version)
	assert.True(t, lock.IsVerified())
}

func TestGenesisLockVerifyMismatch(t *testing.T) {
	tmpDir := t.TempDir()
	manifestPath := filepath.Join(tmpDir, "genesis-manifest.json")

	// Create a test file
	testFile := filepath.Join(tmpDir, "testbin")
	err := os.WriteFile(testFile, []byte("original content"), 0644)
	require.NoError(t, err)

	lock := NewGenesisLock("test-node", manifestPath)
	lock.manifest = &GenesisManifest{
		Version: "1.0.0",
		Binaries: map[string]string{
			testFile: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		},
	}

	result, err := lock.Verify()
	require.NoError(t, err)
	assert.False(t, result.Verified)
	assert.Len(t, result.Mismatches, 1)
	assert.Equal(t, testFile, result.Mismatches[0].Filename)
	assert.False(t, lock.IsVerified())
}

func TestGenesisLockVerifyMissingFile(t *testing.T) {
	tmpDir := t.TempDir()
	manifestPath := filepath.Join(tmpDir, "genesis-manifest.json")

	lock := NewGenesisLock("test-node", manifestPath)
	lock.manifest = &GenesisManifest{
		Version: "1.0.0",
		Binaries: map[string]string{
			"/nonexistent/file": "abc123",
		},
	}

	result, err := lock.Verify()
	require.NoError(t, err)
	assert.False(t, result.Verified)
	assert.Len(t, result.Mismatches, 1)
	assert.Equal(t, "FILE_NOT_FOUND", result.Mismatches[0].ActualHash)
}

func TestGenesisLockVerifyNoManifest(t *testing.T) {
	lock := NewGenesisLock("test-node", "/tmp/nonexistent.json")
	_, err := lock.Verify()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "manifest not loaded")
}

func TestSha256File(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "hashtest")
	err := os.WriteFile(testFile, []byte("hello world"), 0644)
	require.NoError(t, err)

	hash, err := sha256File(testFile)
	require.NoError(t, err)
	// SHA-256 of "hello world" is well-known
	assert.Equal(t, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9", hash)
}

func TestSha256FileNotFound(t *testing.T) {
	_, err := sha256File("/nonexistent/file")
	assert.Error(t, err)
}
