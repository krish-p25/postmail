import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<div className="p-8 text-center text-gray-600">Loading...</div>} />
    </Routes>
  );
}

export default App;
