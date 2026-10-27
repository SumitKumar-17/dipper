package db

import "testing"

func TestPgTypeName(t *testing.T) {
	cases := map[uint32]string{
		23:     "int4",   // the short list
		17:     "bytea",  // only pgx knows it
		869:    "inet",   // likewise
		1007:   "int4[]", // arrays read as arrays
		1009:   "text[]",
		790:    "money",      // added to the short list
		999999: "oid:999999", // a user-defined type stays a stable handle
	}
	for oid, want := range cases {
		if got := pgTypeName(oid); got != want {
			t.Errorf("pgTypeName(%d) = %q, want %q", oid, got, want)
		}
	}
}

func TestOnlyNumbersAndDatesAlignRight(t *testing.T) {
	if alignFor("int4[]") == alignFor("int4") {
		t.Error("an array of numbers is not a number")
	}
}
