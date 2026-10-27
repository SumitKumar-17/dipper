package storage

import "dipper/protocol"

// server.json is how `dipper status` and `dipper stop` find a running instance.
var serverInfoStore = NewStore(ServerInfoFile, 0o600, func() *protocol.ServerInfo { return nil })

func WriteServerInfo(info protocol.ServerInfo) error { return serverInfoStore.Write(&info) }

func ReadServerInfo() (*protocol.ServerInfo, error) { return serverInfoStore.Read() }

func ClearServerInfo() error { return serverInfoStore.Remove() }
