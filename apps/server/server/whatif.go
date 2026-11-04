package server

import (
	"context"
	"errors"
	"net/http"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
)

// WhatIf plans a statement with and without indexes that do not exist.
func (p *Pool) WhatIf(ctx context.Context, idOrName string, request protocol.WhatIfRequest) (protocol.WhatIfResult, error) {
	config, err := p.Config(idOrName)
	if err != nil {
		return protocol.WhatIfResult{}, err
	}
	driver, err := p.DriverFor(ctx, config.ID)
	if err != nil {
		return protocol.WhatIfResult{}, err
	}
	explainer, ok := driver.(db.WhatIfExplainer)
	if !ok {
		return protocol.WhatIfResult{}, httpx.BadRequest(string(config.Dialect) + " connections cannot try hypothetical indexes")
	}
	result, err := explainer.WhatIf(ctx, request)
	if errors.Is(err, db.ErrWhatIfInput) || errors.Is(err, db.ErrExplainEmpty) || errors.Is(err, db.ErrExplainMultiple) {
		return result, httpx.BadRequest(err.Error())
	}
	return result, err
}

func (s *Server) registerWhatIf() {
	s.handle("POST /api/connections/{id}/whatif", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.WhatIfRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		result, err := s.pool.WhatIf(r.Context(), r.PathValue("id"), request)
		if err != nil {
			return err
		}
		return httpx.JSON(w, result)
	})
}
