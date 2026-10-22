// Local ephemeral SSH fixture. Does not read user keys or credentials.
package main
import (
 "crypto/ed25519"
 "crypto/rand"
 "fmt"
 "io"
 "net"
 "os/exec"
 "golang.org/x/crypto/ssh"
)
type terminalReader struct { io.Reader }
func (r terminalReader) Read(p []byte)(int,error){n,e:=r.Reader.Read(p);for i:=0;i<n;i++ {if p[i]==13 {p[i]=10}};return n,e}
func main() {
 _, key, _ := ed25519.GenerateKey(rand.Reader)
 signer, _ := ssh.NewSignerFromKey(key)
 config := &ssh.ServerConfig{PasswordCallback: func(_ ssh.ConnMetadata, password []byte) (*ssh.Permissions,error) { if string(password)!="isolated-fixture" { return nil, fmt.Errorf("invalid fixture password") }; return nil,nil }}
 config.AddHostKey(signer)
 listener, err := net.Listen("tcp","127.0.0.1:63189"); if err!=nil { panic(err) }
 fmt.Println("Isolated SSH fixture ready",ssh.FingerprintSHA256(signer.PublicKey()))
 for { c,err:=listener.Accept(); if err!=nil{return}; go func(){
   conn,chans,requests,err:=ssh.NewServerConn(c,config);if err!=nil {c.Close();return};defer conn.Close();go ssh.DiscardRequests(requests)
   for incoming:=range chans { if incoming.ChannelType()!="session" {incoming.Reject(ssh.UnknownChannelType,"session only");continue};ch,reqs,err:=incoming.Accept();if err!=nil {continue};go func(){defer ch.Close();for req:=range reqs {switch req.Type {case "pty-req","window-change":req.Reply(true,nil);case "shell":req.Reply(true,nil);cmd:=exec.Command("/bin/sh");cmd.Stdin=terminalReader{ch};cmd.Stdout=ch;cmd.Stderr=ch;cmd.Run();ch.SendRequest("exit-status",false,ssh.Marshal(struct{Status uint32}{0}));return;case "exec":var arg struct{Command string};ssh.Unmarshal(req.Payload,&arg);req.Reply(true,nil);cmd:=exec.Command("/bin/sh","-c",arg.Command);cmd.Stdin=terminalReader{ch};cmd.Stdout=ch;cmd.Stderr=ch;cmd.Run();ch.SendRequest("exit-status",false,ssh.Marshal(struct{Status uint32}{0}));return;default:req.Reply(false,nil)}}}() }
 }() }
}
