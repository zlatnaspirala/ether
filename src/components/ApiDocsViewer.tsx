/**
 * Destroyer Engine - Interactive API Documentation Viewer
 */

import React, { useState } from 'react';
import { BookOpen, Search, Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import { API_DOCS_SECTIONS, DocSection } from '../docs/ApiDocsContent';

export const ApiDocsViewer: React.FC = () => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>(API_DOCS_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSections = API_DOCS_SECTIONS.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q);
  });

  const activeSection = API_DOCS_SECTIONS.find((s) => s.id === selectedSectionId) || API_DOCS_SECTIONS[0];

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden max-w-7xl mx-auto w-full select-none">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-80 border-r border-zinc-800/80 bg-zinc-950/40 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search API & guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
          />
        </div>

        {/* Section List */}
        <div className="space-y-1">
          {filteredSections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSelectedSectionId(sec.id)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                selectedSectionId === sec.id
                  ? 'bg-zinc-900 border border-zinc-700/80 text-cyan-300'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-0.5">
                {sec.category}
              </div>
              <div className="text-xs font-semibold">{sec.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Documentation Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
        <div>
          <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-1">
            {activeSection.category}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-['Chakra_Petch'] text-zinc-100 tracking-wide">
            {activeSection.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            {activeSection.summary}
          </p>
        </div>

        {/* Architecture Flow Diagram if available */}
        {activeSection.diagram && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 font-mono text-xs text-cyan-300 space-y-2">
            <div className="text-[10px] uppercase text-zinc-500 font-semibold mb-2">
              Pipeline Flowchart
            </div>
            {activeSection.diagram.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>{line}</span>
              </div>
            ))}
          </div>
        )}

        {/* Markdown Content */}
        <div className="prose prose-invert prose-zinc max-w-none text-xs md:text-sm text-zinc-300 leading-relaxed space-y-4">
          {activeSection.content.split('\n\n').map((paragraph, idx) => {
            if (paragraph.startsWith('###')) {
              return (
                <h3 key={idx} className="text-base font-bold text-zinc-100 mt-6 mb-2">
                  {paragraph.replace('###', '').trim()}
                </h3>
              );
            }
            if (paragraph.startsWith('-')) {
              return (
                <ul key={idx} className="list-disc list-inside space-y-1 text-zinc-300">
                  {paragraph.split('\n').map((item, itemIdx) => (
                    <li key={itemIdx}>{item.replace(/^-\s*/, '')}</li>
                  ))}
                </ul>
              );
            }
            return <p key={idx}>{paragraph}</p>;
          })}
        </div>

        {/* Code Snippet Box */}
        {activeSection.codeSnippet && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-xl mt-6">
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Example Code Implementation
              </span>
              <button
                onClick={() => handleCopyCode(activeSection.codeSnippet!, activeSection.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-[11px]"
              >
                {copiedId === activeSection.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 font-mono text-xs text-zinc-200 overflow-x-auto leading-relaxed">
              <code>{activeSection.codeSnippet}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
