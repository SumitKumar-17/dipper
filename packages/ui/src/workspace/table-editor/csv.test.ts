import { describe, expect, test } from "bun:test";
import { guessDelimiter, parseCsv } from "./csv";

const rows = (text: string, delimiter?: string): string[][] => parseCsv(text, delimiter).rows;

describe("parseCsv", () => {
  test("plain rows, with and without a final newline", () => {
    expect(rows("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("CRLF and bare CR line endings", () => {
    expect(rows("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("a\r1")).toEqual([["a"], ["1"]]);
  });

  test("a quoted field can hold the delimiter, a newline and a doubled quote", () => {
    expect(rows('a,"b,c","line1\nline2","say ""hi"""')).toEqual([["a", "b,c", "line1\nline2", 'say "hi"']]);
  });

  test("empty fields are kept, a blank line is not a row", () => {
    expect(rows("a,,c\n\n1,2,3")).toEqual([["a", "", "c"], ["1", "2", "3"]]);
    expect(rows(",")).toEqual([["", ""]]);
  });

  test("a quoted empty string is an empty field", () => {
    expect(rows('a,"",c')).toEqual([["a", "", "c"]]);
  });

  test("a byte order mark is not part of the first header", () => {
    expect(rows("﻿id,name\n1,x")[0]).toEqual(["id", "name"]);
  });

  test("another delimiter", () => {
    expect(rows("a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("an unterminated quote is reported, not guessed at", () => {
    expect(parseCsv('a,"b\n1,2').error).toContain("never closed");
  });

  test("an empty file has no rows", () => {
    expect(rows("")).toEqual([]);
  });
});

describe("guessDelimiter", () => {
  test("picks the one that splits the header the most", () => {
    expect(guessDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(guessDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(guessDelimiter("a\tb\n1\t2")).toBe("\t");
  });
  test("a one-column file defaults to comma", () => {
    expect(guessDelimiter("name\nx")).toBe(",");
  });
});
