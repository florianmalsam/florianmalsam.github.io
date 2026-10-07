import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudApp from './CloudApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><CloudApp /></React.StrictMode>);