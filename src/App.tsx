import { useState } from 'react'
import Home from './screens/Home'
import FileSelect from './screens/FileSelect'
import Editor from './screens/Editor'
import Export from './screens/Export'

type Screen =
  | { name: 'home' }
  | { name: 'select' }
  | { name: 'editor'; projectId: string }
  | { name: 'export'; projectId: string }

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  switch (screen.name) {
    case 'home':
      return (
        <Home
          onNew={() => setScreen({ name: 'select' })}
          onOpen={(id) => setScreen({ name: 'editor', projectId: id })}
        />
      )
    case 'select':
      return (
        <FileSelect
          onCreated={(id) => setScreen({ name: 'editor', projectId: id })}
          onCancel={() => setScreen({ name: 'home' })}
        />
      )
    case 'editor':
      return (
        <Editor
          projectId={screen.projectId}
          onBack={() => setScreen({ name: 'home' })}
          onDone={(id) => setScreen({ name: 'export', projectId: id })}
        />
      )
    case 'export':
      return (
        <Export
          projectId={screen.projectId}
          onHome={() => setScreen({ name: 'home' })}
          onBackToEdit={(id) => setScreen({ name: 'editor', projectId: id })}
        />
      )
  }
}

export default App
