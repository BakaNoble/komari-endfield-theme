import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../design/endfield-ui/assets/endfield.css';
import './styles.css';
import './console.css';
import './views.css';
import './diagnostics.css';
import './motion.css';
import './instrument.css';
import './host-list.css';
import './traffic.css';
import './controls.css';
import './readability.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
