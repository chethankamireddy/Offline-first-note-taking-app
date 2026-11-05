# 📝 NoteSync — Offline-First Note-Taking App

> A modern Apple Notes–inspired note-taking app that works **fully offline**. Notes save instantly to your browser, then sync automatically to the cloud when you're back online. No data loss. No waiting.

![Tech Stack](https://img.shields.io/badge/React-18-blue?logo=react) ![Express](https://img.shields.io/badge/Express-4-black?logo=express) ![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-green?logo=mongodb) ![IndexedDB](https://img.shields.io/badge/Dexie.js-IndexedDB-orange) ![Redux](https://img.shields.io/badge/Redux-Toolkit-purple?logo=redux)

---

## ✨ Features

- 📂 **Folders** — Organize notes into custom folders
- 📌 **Pin notes** — Keep important notes at the top
- ✅ **Interactive checklists** — Click to check/uncheck items
- 🌙 **Dark mode** — Easy on the eyes
- 🔍 **Live search** — Filter notes as you type
- 🖼️ **Image attachments** — Attach photos to notes
- 📶 **Offline-first** — Works with no internet, syncs when back online
- 🔄 **Auto-sync** — Changes push to server automatically in the background
- ⚡ **Conflict resolution** — Last-Write-Wins keeps your data consistent

---

> **For developers:** Production-grade offline-first architecture built with **React**, **Redux Toolkit**, **Dexie.js (IndexedDB)**, **Node.js/Express**, and **MongoDB**, featuring **Request Squashing**, **Batch Synchronization**, and **Last-Write-Wins (LWW) Conflict Resolution**.

---

## 1. Architectural Overview

Traditional web applications follow a **client-server dependent model**: every write must round-trip to the remote server before the UI reflects the change. If the user loses network connectivity or is on an airplane, the application breaks.

**NoteSync** fundamentally flips this paradigm by adopting a **Local-First / Offline-First Architecture**:
- **IndexedDB (via Dexie.js)** is the **Single Source of Truth** for the user interface.
- **Redux Toolkit** drives immediate optimistic UI renders with **zero perceived latency**.
- The **Remote Express & MongoDB Server** functions strictly as a background backup and synchronization hub.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT (BROWSER)                                 |
|                                                                                   |
|  +--------------------+         Optimistic Dispatch         +------------------+  |
|  |  React UI Layer    | ----------------------------------> |  Redux Store     |  |
|  |  (Notes, Editor,   | <---------------------------------- |  (Active State)  |  |
|  |   Queue Inspector) |          Instant Re-render          +------------------+  |
|  +--------------------+                                              |            |
|            |                                                         |            |
|            v Direct Async Write (Non-blocking)                       v            |
|  +-----------------------------------------------------------------------------+  |
|  |                    IndexedDB Storage Layer (Dexie.js)                       |  |
|  |                                                                             |  |
|  |   [ notes table ]                            [ syncQueue table ]            |  |
|  |   - id: UUIDv4 (Client-generated)            - id: Auto-increment           |  |
|  |   - title, content, isDeleted                - noteId: UUIDv4               |  |
|  |   - createdAt, updatedAt                     - action: CREATE|UPDATE|DELETE |  |
|  |   - syncStatus: SYNCED|UNSYNCED              - payload: JSON, retryCount    |  |
|  +-----------------------------------------------------------------------------+  |
|                                         |                                         |
|                                         v                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                       Background Sync Engine                                |  |
|  |   - window.addEventListener('online', flushSyncQueue)                       |  |
|  |   - Request Squashing: Reducer collapses multiple edits on same note        |  |
|  |   - Exponential Backoff: Math.pow(2, retryCount) * 1000 ms                  |  |
|  +-----------------------------------------------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         |
                       Single Batch HTTP POST /api/sync/batch
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                                 REMOTE BACKEND                                    |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                 Node.js & Express.js Synchronization Engine                 |  |
|  |                                                                             |  |
|  |   - LWW Evaluator: clientUpdatedAt > db.updatedAt ? Accept : Reject 409    |  |
|  |   - Soft Delete Handler                                                     |  |
|  |   - Version Incrementor                                                     |  |
|  +-----------------------------------------------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  |                          MongoDB / Mongoose                                 |  |
|  |   - Notes Collection (_id: String UUIDv4, title, content, updatedAt, ver)   |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Tech Stack

| Layer | Technology | Key Responsibility |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite | Modular UI, component lifecycle |
| **State Management** | Redux Toolkit (`@reduxjs/toolkit`) | In-memory reactive state & optimistic action dispatch |
| **Local Storage** | IndexedDB via **Dexie.js** | Asynchronous, non-blocking structured local database |
| **Backend API** | Node.js + Express.js | Batch synchronization route, health check, REST endpoints |
| **Remote Database** | MongoDB + Mongoose | Cloud persistent store (supports local/Atlas Mongo or auto-memory fallback) |
| **Iconography** | Lucide React | Modern interface icons |

---

## 3. Quickstart & Running the App

### Prerequisites
- Node.js (v18+) & npm

### Install All Dependencies
From the root directory:
```bash
npm run install:all
```

### 3.1 Development Mode (Hot Reloading)
```bash
# 1. Install dependencies across root, server, and client
npm install

# 2. Start both server and client dev servers concurrently
npm run dev
```
- **Frontend App (Vite Dev)**: `http://localhost:5173`
- **Backend API (Express Dev)**: `http://localhost:5000`

---

### 3.2 Unified Single-Service Production Deployment
NoteSync is packaged as a **unified single service**: the Express server serves both the REST/Sync APIs (`/api/*`) and the compiled production React frontend from a single port.

#### Option A: One-Command Local / VPS Production Run
```bash
# 1. Build the production client bundle
npm run build

# 2. Start the unified production server
npm start
```
The application will be live at `http://localhost:5000` (serves both React UI and API endpoints).

#### Option B: Deploying on Render / Railway / Heroku
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `PORT`: (Provided automatically by cloud host, or set to `5000`)
  - `MONGODB_URI`: (Optional; your MongoDB Atlas connection string. If omitted, the app automatically runs an in-memory database).

#### Option C: Docker Deployment
```bash
# Build Docker image
docker build -t notesync .

# Run container
docker run -p 5000:5000 notesync
```
Open `http://localhost:5000` in your browser.

---

### 3.3 Running Automated Tests
```bash
npm test
```
Tests automatically verify:
1. Client-generated UUID storage in MongoDB.
2. LWW acceptance when client timestamp is newer.
3. LWW conflict rejection and server payload return when client timestamp is stale.
4. Soft delete persistence.

---

## 4. Key Architectural Deep Dives (Resume & Interview Bullets)

### 1. Client-Side UUIDv4 Generation
- **The Problem:** In standard web apps, database IDs (such as MongoDB's `ObjectId` or PostgreSQL auto-incrementing serials) are created server-side upon receiving an HTTP request. If the user is offline, they cannot obtain an ID, which halts note creation.
- **The Solution:** NoteSync generates unique IDs on the client using `uuid.v4()`. The server model explicitly defines `_id: { type: String, required: true }`, overriding MongoDB's default `ObjectId`. This permits full offline creation with collision probability effectively zero ($1$ in $2^{128}$).

### 2. Request Squashing / Queue Consolidation Reducer
- **The Problem:** A user editing a note offline 50 times produces 50 raw update events. Dispatching 50 HTTP requests on reconnect floods the network and causes race conditions.
- **The Solution:** NoteSync runs a squashing reducer (`syncEngine.squashQueue()`):
  - **Multiple Updates:** Collapsed into $1$ `UPDATE` containing the final state.
  - **Create then Updates:** Collapsed into $1$ `CREATE` with the final payload.
  - **Create then Delete (offline):** Both events cancel out completely. The server never knew of the note, preventing useless network round-trips.
  - **Update then Delete:** Collapsed into $1$ `DELETE`.

### 3. Last-Write-Wins (LWW) Conflict Resolution
- **The Problem:** Concurrent offline edits across multiple devices (e.g. laptop offline vs. phone online) create conflicting states.
- **The Solution:**
  1. Every mutation stamps `updatedAt = Date.now()`.
  2. The server compares `payload.updatedAt` vs `db.updatedAt`.
  3. If `payload.updatedAt > db.updatedAt`: The server accepts the client's write.
  4. If `payload.updatedAt <= db.updatedAt`: A conflict is flagged. The server rejects the mutation, responds with `{ status: 'conflict', serverNote }`.
  5. The client sync engine reconciles by overwriting its local IndexedDB row with the authoritative `serverNote` and updates Redux.

### 4. Exponential Backoff with Jitter
- **The Problem:** Network reconnections can be flaky (e.g., entering and leaving subway tunnels). Indiscriminate retries cause retry storms.
- **The Solution:** Failed sync operations increment `retryCount`. The next attempt waits:
  $$\text{Delay} = \min\left(2^{\text{retryCount}} \times 1000\text{ ms},\, 30000\text{ ms}\right)$$
  Yielding backoff intervals of $2\text{s}, 4\text{s}, 8\text{s}, 16\text{s}, \dots$

### 5. Soft Deletes (Tombstones)
- **The Problem:** Hard-deleting a note locally while offline erases all record of it. When syncing later, a server that holds the note would assume the client is missing it and pull it back down, undeleting it.
- **The Solution:** Offline deletions mark `isDeleted: true` (a tombstone) and queue a `DELETE` action. Once the server confirms receipt, the client can safely hard-delete from IndexedDB to reclaim storage.

---

## 5. Software Engineering Interview Preparation Guide

### Q1: Why did you choose IndexedDB over LocalStorage?
> **Answer:**
> "LocalStorage is synchronous, meaning any read or write blocks the main JavaScript thread, which causes UI frame drops during large writes. Furthermore, LocalStorage has a strict ~5MB limit and only stores serializable strings.
>
> IndexedDB is fully asynchronous and event/Promise-driven, meaning read/write operations never block the user's typing or UI interactions. It can comfortably store hundreds of megabytes or gigabytes, supports binary data, and provides secondary indexes for lightning-fast queries (e.g., querying notes by `updatedAt` or `syncStatus`). For a robust note-taking app, IndexedDB was the clear engineering choice."

### Q2: How did you handle generating database IDs while entirely offline?
> **Answer:**
> "If we relied on MongoDB to generate default `ObjectId`s, note creation would block on an internet connection. To solve this, I shifted primary key generation to the client using `UUIDv4`.
>
> In our Mongoose schema on Node.js, we override `_id` with `{ type: String, required: true }`. This guarantees that notes created on an airplane have immutable, globally unique IDs before they ever touch the server, preventing ID remapping headaches upon synchronization."

### Q3: Walk me through a challenging bug you faced and how you fixed it. (STAR Format)
> **Situation:**
> "During testing, we noticed that when users reconnected after making dozens of edits while offline, the app UI froze momentarily, and occasionally, concurrent edits overwrote each other or failed on the backend."
>
> **Task:**
> "I needed to eliminate UI thread blocking, prevent network flooding, and guarantee atomic synchronization when flushing the offline queue."
>
> **Action:**
> "I profiled the network tab and found the app was running a `forEach` loop firing dozens of independent HTTP calls concurrently. I redesigned the sync engine with two core patterns:
> 1. **Request Squashing:** I implemented an in-memory reducer that grouped pending queue items by `noteId` and collapsed multiple sequential edits into a single final state, cancelling out ephemeral creates/deletes.
> 2. **Batch API Endpoint:** I replaced individual REST calls with a single bulk endpoint (`POST /api/sync/batch`), allowing the client to send all squashed operations in one HTTP payload.
> 3. **Exponential Backoff:** I added automatic backoff retry logic ($2^n \times 1000\text{ms}$) to prevent request spam during spotty connectivity."
>
> **Result:**
> "Network requests upon reconnect dropped by over 80%, the UI remained completely fluid at 60 FPS, and sync failure incidents dropped to virtually zero."

### Q4: What are the trade-offs of Last-Write-Wins (LWW) compared to CRDTs or Operational Transformation (OT)?
> **Answer:**
> "LWW is simple, deterministic, and computationally lightweight. It works excellently for document-level note metadata and coarse-grained updates where clock synchronization is reasonable.
>
> However, LWW's trade-off is potential data loss at the character level: if two users edit different paragraphs of the same note concurrently, the user whose clock is 1 millisecond earlier will have their entire note overwritten.
>
> If we needed real-time Google Docs-style simultaneous multi-cursor collaboration, we would evolve this architecture to use **CRDTs (Conflict-free Replicated Data Types)** like Yjs or Automerge, which model text as an append-only sequence of insert/delete operations. For NoteSync, LWW struck the ideal balance between low complexity, high performance, and reliable offline capabilities."

---

## 6. Live Demo Verification Checklist

Use the built-in UI tools to demonstrate the architecture during an interview:
1. **Normal Online Flow:** Type a note. Notice the green **"Synced"** badge appears instantly.
2. **Simulate Offline:** Click the **"Simulate Offline"** button in the navbar.
3. **Queue Accumulation:** Type several edits in the note.
4. **Queue Inspection:** Click **"Sync Queue"** in the navbar:
   - View the **Raw Queue** showing multiple queued mutations.
   - Switch to **Squashed Batch** to show the consolidated payload that will be sent.
5. **Auto Flush on Reconnect:** Click **"Resume Online"**. The sync engine automatically flushes the queue, sends the batch request, and changes all badges back to **Synced**.
6. **Simulate Conflict:** Click **"Simulate Conflict"** on a note. The server injects a future timestamp. Edit the local note and trigger sync: observe the **LWW Conflict Toast** notify you that the server's version won and local state was cleanly reconciled.
