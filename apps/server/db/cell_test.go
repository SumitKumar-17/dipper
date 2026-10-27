package db

import (
	"encoding/json"
	"math"
	"testing"
)

func TestToCellKeepsRowBatchesEncodable(t *testing.T) {
	for _, v := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		cell := toCell(v)
		if _, err := json.Marshal(cell); err != nil {
			t.Errorf("toCell(%v) cannot be encoded: %v", v, err)
		}
	}
	if got := toCell(1.5); got != 1.5 {
		t.Errorf("finite floats must pass through, got %v", got)
	}
}
