// STEP 1 — Add these two lines near your other useState declarations (around line 50)
const [editingId, setEditingId] = useState(null);
const [editDraft, setEditDraft] = useState("");

// STEP 2 — Add this function near removeMessage()
async function saveEdit(m) {
  const text = editDraft.trim();
  if (!text || text === m.text) {
    setEditingId(null);
    return;
  }
  try {
    await updateDoc(doc(db, "chats", code, "messages", m.id), {
      text: text.slice(0, 1000),
      edited: true,
    });
    setEditingId(null);
  } catch {
    setError("Couldn't save the edit. Try again.");
  }
}

// STEP 3 — Replace the bottom meta row of each message bubble.
// Find this block (around line 460 in your file):
//
//   <div className={`text-[10px] text-[#5C5850] mt-1 ${mine ? "text-right" : ""}`}>
//     {timeOf(m)}
//     ...
//     {(mine || isStaff) && (
//       <button onClick={() => removeMessage(m)} ...>Delete</button>
//     )}
//   </div>
//
// Replace it with this:

<div className={`text-[10px] text-[#5C5850] mt-1 ${mine ? "text-right" : ""}`}>
  {timeOf(m)}
  {m.edited && <span className="ml-1 opacity-60">· edited</span>}
  {m.type !== "call" && !iAmMuted && (
    <button
      onClick={() => startReply(m)}
      className="ml-2 text-[#5C5850] hover:text-[#C9A44C] underline"
    >
      Reply
    </button>
  )}
  {isStaff && !m.type && m.text && (
    <button
      onClick={() => pinText(m.text)}
      className="ml-2 text-[#5C5850] hover:text-[#C9A44C] underline"
    >
      Pin
    </button>
  )}
  {mine && !m.type && !m.mediaId && (
    <button
      onClick={() => {
        setEditingId(m.id);
        setEditDraft(m.text);
      }}
      className="ml-2 text-[#5C5850] hover:text-[#C9A44C] underline"
    >
      Edit
    </button>
  )}
  {(mine || isStaff) && (
    <button
      onClick={() => removeMessage(m)}
      className="ml-2 text-[#5C5850] hover:text-[#E07A66] underline"
    >
      Delete
    </button>
  )}
</div>

// STEP 4 — Add the inline editor inside the bubble.
// Find the main bubble div (the one with bg-[#C9A44C] or bg-[#161514]).
// Just before the closing </div> of that bubble, add this block:

{editingId === m.id && (
  <div className="mt-2">
    <textarea
      autoFocus
      value={editDraft}
      onChange={e => setEditDraft(e.target.value.slice(0, 1000))}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          saveEdit(m);
        }
        if (e.key === "Escape") setEditingId(null);
      }}
      rows={3}
      className="w-full bg-[#0B0B0C] border border-[#C9A44C]/60 rounded-xl px-3 py-2 text-[13px] text-[#F5F1E8] outline-none resize-none"
    />
    <div className="flex gap-2 mt-1.5">
      <button
        onClick={() => saveEdit(m)}
        className="rounded-lg bg-[#C9A44C] text-[#0B0B0C] px-3 py-1 text-[12px] font-semibold"
      >
        Save
      </button>
      <button
        onClick={() => setEditingId(null)}
        className="rounded-lg border border-[#232019] text-[#D8D2C4] px-3 py-1 text-[12px]"
      >
        Cancel
      </button>
    </div>
  </div>
)}
