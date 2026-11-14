import {startPwaWithDeviceCache} from './startPwaWithDeviceCache';
import {bindNotebookBeforeUnload} from '../../src/lib/notebookBeforeUnload';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import '../../src/design-tokens.css';
import './study-mobile.css';

void startPwaWithDeviceCache(()=>ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>));
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }));

const unbindNotebookBeforeUnload=bindNotebookBeforeUnload(window);
if(import.meta.hot)import.meta.hot.dispose(unbindNotebookBeforeUnload);
