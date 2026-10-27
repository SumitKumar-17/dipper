package server

import (
	"context"
	"errors"
	"net/http"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
)

// sessionHost finds the driver of a connection and checks it can hold sessions.
func (p *Pool) sessionHost(ctx context.Context, connectionID string) (db.SessionHost, error) {
	driver, err := p.DriverFor(ctx, connectionID)
	if err != nil {
		return nil, err
	}
	host, ok := driver.(db.SessionHost)
	if !ok {
		return nil, httpx.BadRequest("this connection cannot hold a session")
	}
	return host, nil
}

// OpenSession pins a database connection for one user and remembers who owns it.
func (p *Pool) OpenSession(ctx context.Context, idOrName, database string) (protocol.SessionInfo, error) {
	config, err := p.Config(idOrName)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	host, err := p.sessionHost(ctx, config.ID)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	info, err := host.OpenSession(ctx, database)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	p.mu.Lock()
	p.sessions[info.ID] = config.ID
	p.mu.Unlock()
	return info, nil
}

// ownerOf is the connection a session belongs to, or a 404 once it is gone.
func (p *Pool) ownerOf(sessionID string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	owner, ok := p.sessions[sessionID]
	if !ok {
		return "", httpx.NotFound(db.ErrNoSession.Error())
	}
	return owner, nil
}

func (p *Pool) Session(ctx context.Context, sessionID string) (protocol.SessionInfo, error) {
	owner, err := p.ownerOf(sessionID)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	host, err := p.sessionHost(ctx, owner)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	info, err := host.SessionInfo(sessionID)
	if errors.Is(err, db.ErrNoSession) {
		p.forget(sessionID)
		return protocol.SessionInfo{}, httpx.NotFound(err.Error())
	}
	return info, err
}

func (p *Pool) CloseSession(ctx context.Context, sessionID string) error {
	owner, err := p.ownerOf(sessionID)
	if err != nil {
		return err
	}
	host, err := p.sessionHost(ctx, owner)
	if err != nil {
		return err
	}
	p.forget(sessionID)
	if err := host.CloseSession(ctx, sessionID); err != nil && !errors.Is(err, db.ErrNoSession) {
		return err
	}
	return nil
}

func (p *Pool) forget(sessionID string) {
	p.mu.Lock()
	delete(p.sessions, sessionID)
	p.mu.Unlock()
}

// checkSession refuses a run that names a session belonging to some other connection.
func (p *Pool) checkSession(sessionID, connectionID string) error {
	owner, err := p.ownerOf(sessionID)
	if err != nil {
		return err
	}
	if owner != connectionID {
		return httpx.BadRequest("that session belongs to a different connection")
	}
	return nil
}

func (s *Server) registerSessions() {
	s.handle("POST /api/connections/{id}/sessions", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.OpenSessionRequest
		// An empty body is fine: the connection's own database is the default.
		if r.ContentLength != 0 {
			if err := httpx.DecodeJSON(r, &request); err != nil {
				return err
			}
		}
		info, err := s.pool.OpenSession(r.Context(), r.PathValue("id"), request.Database)
		if err != nil {
			return err
		}
		return httpx.JSON(w, info, http.StatusCreated)
	})

	s.handle("GET /api/sessions/{sid}", func(w http.ResponseWriter, r *http.Request) error {
		info, err := s.pool.Session(r.Context(), r.PathValue("sid"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, info)
	})

	// Ending a session rolls back anything still open on it.
	s.handle("DELETE /api/sessions/{sid}", func(w http.ResponseWriter, r *http.Request) error {
		if err := s.pool.CloseSession(r.Context(), r.PathValue("sid")); err != nil {
			return err
		}
		return httpx.JSON(w, map[string]any{"ok": true})
	})
}
