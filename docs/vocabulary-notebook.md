# Account vocabulary notebook

Voice requests such as “lưu giúp tôi từ commute”, “lưu từ này”, “ghi lại từ vừa rồi”
and “save that word” are handled by Gemini's `save_vocabulary` function. The tutor
resolves a clear reference to the latest discussed English term or asks which
term when ambiguous. The client sends that term, Vietnamese meaning and optional
example to the account notebook. A tool response reports `saved=true` only after
the save handler completes successfully; errors report that synchronization is
unconfirmed. The tutor must wait for that result before speaking a confirmation.
Cancelled calls and disconnected sockets do not receive stale acknowledgements.
The thinking watchdog pauses during a pending save so network latency does not
force a reconnect mid-operation. `show_vocabulary` remains the display/auto-capture
tool and is never treated as proof of an explicit save's persistence.

The Android notebook stores each Gemini `show_vocabulary` event on the backend
under the JWT's authenticated user ID. It supports automatic capture, manual
addition, saving current report words, search, and deleting individual entries.
Signing in on another device retrieves the same account notebook. Device user
IDs select only local migration/outbox keys; the API never accepts them as owners.

Endpoints protected by AuthGuard:

- `GET /vocabulary?limit=100&cursor=<uuid>`: scoped cursor pagination.
- `POST /vocabulary`: `{term, meaningVi, example?}`; upsert by account and term.
- `POST /vocabulary/import`: `{words: [...]}`; up to 100 words per transaction.
- `DELETE /vocabulary/:id`: idempotent deletion scoped to the authenticated user.

## Vocabulary decks

The Vocabulary tab displays account-owned topic decks. Each word belongs to one
deck; existing words and new automatic conversation saves appear in the built-in
Unclassified deck until the user moves them. Users can create and rename decks,
add words directly inside a deck, and select up to 100 words to move at once.
Search within a deck, drafts, and navigation history survive tab changes.

Additional authenticated endpoints:

- `GET /vocabulary/decks`: lists the owner's named decks with word counts.
- `POST /vocabulary/decks`: `{name}`; creates a deck with an account-unique name.
- `PATCH /vocabulary/decks/:id`: `{name}`; renames an owned deck.
- `DELETE /vocabulary/decks/:id`: deletes an owned deck; its words return to Unclassified.
- `PATCH /vocabulary/assignment`: `{wordIds, deckId}`; atomically moves 1–100 owned
  words to an owned deck, or to Unclassified when `deckId` is `null`.
- `POST /vocabulary` also accepts optional `deckId`. Omission preserves membership
  when an existing word is captured again; explicit `null` returns it to Unclassified.

Migration `20261013170000_vocabulary_decks` adds `VocabularyDeck` and a nullable
`VocabularyItem.deckId` foreign key with `ON DELETE SET NULL`. Existing words and
learning-memory links remain intact. Assignment pins words so session reanalysis
cannot discard a word that the user deliberately organized. Older mobile clients
remain compatible with the expanded word response.

Pending manual saves retain their requested deck in the outbox. If that deck is
deleted on another device before synchronization, the word is saved to
Unclassified. A stale acknowledgement cannot remove a newer pending assignment.
Deploy the API and this migration before installing the deck-enabled mobile APK.

The existing `VocabularyItem` table is shared with post-session learning memory.
Migration `20261012160000_vocabulary_notebook` adds `pinned BOOLEAN DEFAULT false`.
Explicit and live saves pin items so reanalysis cannot remove them when their last
session reference disappears. Pinned words participate in the tutor's learning
context even before their first session analysis. Deleting a word removes its
session links through the existing foreign-key cascade. Learning it again may
save it again through a later vocabulary event or analysis.

On first use, the app uploads the previous phone notebook in batches. Existing
server meanings/examples win over older imported copies. The phone marks migration
complete only after every batch is acknowledged and retains the original backup;
it never reimports that backup after a server deletion. Unique account+term keys
make migration retries idempotent.

New words are first staged in a per-account local outbox, independently of pending
network requests. Server acknowledgement removes only the exact staged version so
a newer correction cannot be discarded. Network failures retain words for sync on
the next app open, notebook open, or explicit Sync. Vocabulary requests have a
30-second timeout. Failed deletions remain visible and must be retried; they are
not silently queued. The server is the notebook's source of truth.

Validation includes account-scoped reads/cursors/deletes, caller-supplied ownership
rejection, pinned-word preservation, idempotent migration, server-wins imports,
pagination, local outbox retries, correction/acknowledgement races, and capturing
every vocabulary event in a batched React update.
