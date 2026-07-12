interface AudioOnlyPanelProps {
  isRecording: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  audioLevel: number;
  formattedDuration: string;
  permissionDenied: boolean;
  needsConsent: boolean;
  isStarting?: boolean;
  onGrantConsent: () => void;
  userTranscript: string;
  onTranscriptChange: (text: string) => void;
  speechLang: string;
  onSpeechLangChange: (lang: string) => void;
}

export default function AudioOnlyPanel({
  isRecording,
  isSpeaking,
  isProcessing,
  audioLevel,
  formattedDuration,
  permissionDenied,
  needsConsent,
  isStarting = false,
  onGrantConsent,
  userTranscript,
  onTranscriptChange,
  speechLang,
  onSpeechLangChange,
}: AudioOnlyPanelProps) {
  if (needsConsent) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-teal-200 bg-teal-50/80 p-4 text-center">
        <p className="mb-3 text-xs text-teal-900">
          Fully automated voice interview — James asks, you answer, everything runs automatically.
        </p>
        <button
          onClick={onGrantConsent}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Begin Interview
        </button>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        Microphone denied — allow mic in browser and refresh.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-gray-200 bg-slate-50 p-4 shadow-inner">
      {/* Visualizer panel */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[160px]">
        {isSpeaking && (
          <div className="flex flex-col items-center animate-fade-in">
            {/* AI speaking wave */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-blue-50">
              <div className="absolute w-20 h-20 rounded-full bg-blue-100 animate-ping opacity-60" style={{ animationDuration: '2s' }} />
              <div className="absolute w-16 h-16 rounded-full bg-blue-200 animate-pulse" />
              <svg className="w-8 h-8 text-blue-600 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-semibold text-blue-700 tracking-wide animate-pulse">
              James is speaking...
            </p>
            <span className="text-[10px] text-gray-500 uppercase mt-0.5 tracking-wider">AI Voice</span>
          </div>
        )}

        {isRecording && (
          <div className="flex flex-col items-center animate-fade-in w-full px-4">
            {/* Candidate recording mic */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-emerald-50">
              <div className="absolute w-20 h-20 rounded-full bg-emerald-100 animate-ping opacity-75" style={{ animationDuration: '1.5s' }} />
              <div className="absolute w-16 h-16 rounded-full bg-emerald-200 animate-pulse" />
              <svg className="w-8 h-8 text-emerald-600 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-semibold text-emerald-700 tracking-wide">
              Taking input...
            </p>
            <span className="text-[10px] text-red-500 font-mono font-medium animate-pulse mt-0.5 mb-3">
              Recording • {formattedDuration}
            </span>

            {/* Premium Live transcription display */}
            <div className="w-full max-w-md rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 shadow-inner backdrop-blur-sm transition-all duration-300">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Live Speech Preview
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <p className="text-center text-sm font-medium text-emerald-950 leading-relaxed min-h-[2.5rem] max-h-24 overflow-y-auto px-1 scrollbar-thin">
                {userTranscript.trim() ? (
                  userTranscript
                ) : (
                  <span className="text-gray-400 italic font-normal animate-pulse">
                    Start speaking, your words will appear here live...
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center">
            {/* Loading/evaluating spinner */}
            <div className="relative flex items-center justify-center w-20 h-20">
              <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-600 animate-spin" />
            </div>
            <p className="mt-3 text-sm font-medium text-amber-700">
              Evaluating your answer...
            </p>
            <span className="text-[10px] text-gray-500 mt-0.5">Analyzing speech &amp; depth</span>
          </div>
        )}

        {isStarting && !isRecording && !isSpeaking && !isProcessing && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
            <p className="mt-3 text-sm font-medium text-teal-700">Starting interview...</p>
            <span className="text-[10px] text-gray-500 mt-0.5">Connecting voice &amp; mic...</span>
          </div>
        )}

        {!isSpeaking && !isRecording && !isProcessing && !isStarting && (
          <div className="flex flex-col items-center">
            {/* Standby State */}
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-gray-100">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-600">Standby</p>
            <span className="text-[10px] text-gray-400 mt-0.5">Ready for next step</span>
          </div>
        )}
      </div>

      {/* Audio Level Waveform Indicator (only shown while recording) */}
      {isRecording && (
        <div className="my-3 flex h-8 items-end justify-center gap-0.5 bg-emerald-50/50 py-1 rounded-lg">
          {Array.from({ length: 24 }).map((_, i) => {
            const threshold = (i / 24) * 100;
            const active = audioLevel >= threshold;
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all ${
                  active ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
                style={{ height: active ? `${8 + (audioLevel / 100) * 18}px` : '4px' }}
              />
            );
          })}
        </div>
      )}

      {/* Editable live transcription box */}
      <div className="mt-3 bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm">
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Your Answer (Editable Transcription)
            </span>
            <div className="flex items-center gap-1">
              <label htmlFor="speech-lang-select" className="sr-only">Speech Recognition Language</label>
              <select
                id="speech-lang-select"
                value={speechLang}
                onChange={(e) => onSpeechLangChange(e.target.value)}
                className="rounded border border-gray-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 focus:border-teal-500 focus:outline-none transition-colors duration-150 cursor-pointer"
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
          </div>
          {isRecording && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-600 font-medium animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Transcribing...
            </span>
          )}
        </div>
        <textarea
          rows={3}
          value={userTranscript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder={isRecording ? "Speak into your mic. Your speech will appear here. Feel free to edit..." : "Type your answer here or click Start Recording..."}
          className="w-full text-xs text-gray-700 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded border border-gray-200 p-1.5 focus:border-teal-500 focus:outline-none resize-none transition-colors duration-150 whitespace-pre-wrap max-h-32 overflow-y-auto"
        />
      </div>
    </div>
  );
}
