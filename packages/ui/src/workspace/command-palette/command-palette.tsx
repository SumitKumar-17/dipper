// The command palette: ⌘K, and everything reachable from it.
//
// Every group draws from `asyncData` - the last value that loaded, whatever the status - because a
// palette that renders nothing until the schema arrives feels broken on the first ⌘K. A group with
// nothing in it is dropped rather than shown empty.
//
// Selecting a table does not edit your SQL: there is no "insert at the cursor" in the contract, and
// inventing one would mean this package deciding what happens to someone's buffer. It reveals the
// table in the schema sidebar instead.
//
// This file is the shell: the rows live in `palette-items.ts` and the commands in
// `palette-actions.ts`, both of which say what they build without also owning the dialog.

import * as React from "react";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "../../ui/command";
import { useWorkspace } from "../context";
import { PALETTE } from "../shortcuts";
import { useHotkey } from "../use-hotkey";
import { asyncData } from "../types";
import { requestTableEditor } from "../table-editor";
import { useBuiltinActions } from "./palette-actions";
import {
  connectionItems,
  databaseItems,
  fileItems,
  historyItems,
  tableItems,
  type PaletteGroup,
  type PaletteItem,
} from "./palette-items";
import { PREFIX_HINTS, visibleGroups } from "./palette-search";

export function CommandPalette(): React.ReactElement {
  const {
    activeBuffer,
    activeBufferId,
    connect,
    connections,
    cursor,
    database,
    databases,
    buffers,
    focusBuffer,
    newScratch,
    panels,
    refreshSchema,
    run,
    runs,
    save,
    schema,
    selectRun,
    selectDatabase,
    setPanel,
    togglePanel,
  } = useWorkspace();

  const [query, setQuery] = React.useState("");

  useHotkey(PALETTE, () => togglePanel("paletteOpen"));

  const close = React.useCallback(() => setPanel("paletteOpen", false), [setPanel]);

  // A table is a thing to open, so it opens in the Table Editor rather than only being found in the
  // sidebar: browsing and editing it is what someone who names a table wants next.
  const openTable = React.useCallback(
    (table: { schema: string; name: string }) => {
      requestTableEditor(table.schema, table.name);
      close();
    },
    [close],
  );

  const actions = useBuiltinActions(
    {
      activeBuffer,
      activeBufferId,
      cursor,
      panels,
      newScratch,
      save,
      run,
      refreshSchema,
      togglePanel,
    },
    close,
  );

  // A schema that is refetching, or failed after loading once, is still the best answer here.
  const loadedSchema = asyncData(schema);
  const loadedConnections = asyncData(connections);
  const loadedDatabases = asyncData(databases);

  const groups: PaletteGroup[] = React.useMemo(() => {
    const actionItems: PaletteItem[] = actions.map((action, index) => ({
      ...action,
      value: `action:${index}:${action.label}`,
    }));

    // Actions first, then what you might be looking at, with tables last: leading with forty
    // tables would put a schema between you and the commands the palette is opened for, and tables
    // are the one group you reach by typing a name you already know.
    return [
      { value: "Actions", items: actionItems },
      {
        value: "Files",
        items: fileItems(buffers, (id) => {
          focusBuffer(id);
          close();
        }),
      },
      {
        value: "Connections",
        items: connectionItems(loadedConnections, (id) => {
          // The palette has nowhere to put a message; the picker and the status dot both read the
          // failure out of `connections`, which the dial records either way.
          void connect(id).catch(() => {});
          close();
        }),
      },
      {
        value: "Databases",
        items: databaseItems(loadedDatabases, database, (name) => {
          void selectDatabase(name);
          close();
        }),
      },
      { value: "Tables", items: tableItems(loadedSchema, openTable) },
      {
        value: "History",
        items: historyItems(runs, (id) => {
          selectRun(id);
          close();
        }),
      },
    ].filter((group) => group.items.length > 0);
  }, [
    actions,
    buffers,
    close,
    connect,
    database,
    focusBuffer,
    loadedConnections,
    loadedDatabases,
    loadedSchema,
    openTable,
    runs,
    selectDatabase,
    selectRun,
  ]);

  // Narrowed here rather than by the dialog's own filter, which would match the prefix character
  // against every row. `filter={null}` below turns that one off.
  const shown = React.useMemo(() => visibleGroups(groups, query), [groups, query]);

  return (
    <CommandDialog
      onOpenChange={(open) => {
        setPanel("paletteOpen", open);
        // Every ⌘K starts from a blank query; a palette that reopens mid-search is disorienting.
        if (open) setQuery("");
      }}
      open={panels.paletteOpen}
    >
      <CommandDialogPopup aria-label="Command palette">
        <Command filter={null} items={shown} onValueChange={setQuery} value={query}>
          <CommandInput placeholder="Search commands, files and tables" />
          <CommandPanel>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandList>
              {(group: PaletteGroup) => (
                <CommandGroup items={group.items} key={group.value}>
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: PaletteItem) => (
                      <CommandItem key={item.value} onClick={item.onSelect} value={item}>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {item.icon && <item.icon className="size-3.5 shrink-0" />}
                          <span className="truncate">{item.label}</span>
                          {item.hint && (
                            <span className="truncate text-muted-foreground text-xs">
                              {item.hint}
                            </span>
                          )}
                        </span>
                        {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span>
              {PREFIX_HINTS.map(({ prefix, label }) => `${prefix} ${label}`).join(" · ")}
              {" · "}↑↓ navigate · ↵ select · esc close
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
