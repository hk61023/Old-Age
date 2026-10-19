import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './style.css';
const Admin=React.lazy(()=>import('./ui/Admin'));
createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/admin')?<Suspense fallback={<p className="loading">正在加载管理后台…</p>}><Admin/></Suspense>:<App/>);
