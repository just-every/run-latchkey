package latchkey

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "os/exec"
 "time"
)

var ErrRuntimeRequest = errors.New("runtime_request_failed")

type Client struct {
 BridgePath string
 Node string
}

type cappedOutput struct { bytes.Buffer; limit int }
func (b *cappedOutput) Write(p []byte) (int, error) {
 if len(p) > b.limit-b.Len() { return 0, ErrRuntimeRequest }
 return b.Buffer.Write(p)
}

// Load fetches approved values, with no credential arguments, files or cache.
func (c Client) Load(ctx context.Context, request any) (map[string]string, error) {
 payload, err := json.Marshal(request)
 if err != nil || len(payload) > 1500000 || c.BridgePath == "" { return nil, ErrRuntimeRequest }
 node := c.Node
 if node == "" { node = "node" }
 ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
 defer cancel()
 command := exec.CommandContext(ctx, node, c.BridgePath)
 command.Stdin = bytes.NewReader(payload)
 stdout := &cappedOutput{limit: 4000001}
 stderr := &cappedOutput{limit: 4096}
 command.Stdout, command.Stderr = stdout, stderr
 if command.Run() != nil { return nil, ErrRuntimeRequest }
 var values map[string]string
 if json.Unmarshal(stdout.Bytes(), &values) != nil || values == nil { return nil, ErrRuntimeRequest }
 // encoding/json permits null into string values; reject those explicitly.
 var raw map[string]json.RawMessage
 if json.Unmarshal(stdout.Bytes(), &raw) != nil { return nil, ErrRuntimeRequest }
 for _, value := range raw { if bytes.Equal(bytes.TrimSpace(value), []byte("null")) { return nil, ErrRuntimeRequest } }
 return values, nil
}
