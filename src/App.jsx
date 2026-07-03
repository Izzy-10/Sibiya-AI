<textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Sibiya AI..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 placeholder:text-[#5C5850] max-h-32"
          />
          <button
            onClick={sendMessage}
            disabled={loading || (!input.trim() && !pendingFile)}
            className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] disabled:bg-[#2A2823] disabled:text-[#5C5850] text-[#0B0B0C] flex items-center justify-center transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
