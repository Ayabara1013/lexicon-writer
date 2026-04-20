import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'

export default function App() {
  const [activeId, setActiveId] = useState<string | null>('1')

  return (
    <div className="flex h-screen bg-base-100 text-base-content" data-theme="lexicon">
      <Sidebar activeId={activeId} onSelect={setActiveId} />
      <main className="flex-1 overflow-hidden">
        {activeId ? (
          <Editor key={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-base-content/30 text-sm">
            Select a document to start writing
          </div>
        )}
      </main>
    </div>
  )
}
