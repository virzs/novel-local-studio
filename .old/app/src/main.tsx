import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/business/shared/ThemeProvider';
import { TooltipProvider } from './components/ui/tooltip';
import App, { AppLayoutWrapper } from './App';
import { BookWorkspaceLayout } from './layouts/BookWorkspaceLayout';
import { NewBookPage } from './pages/NewBookPage';
import { OverviewPage } from './pages/workspace/OverviewPage';
import { WorldPage } from './pages/workspace/WorldPage';
import { OutlinePage } from './pages/workspace/OutlinePage';
import { WritingPage } from './pages/workspace/WritingPage';
import { ReviewPage } from './pages/workspace/ReviewPage';
import { ReadingPage } from './pages/workspace/ReadingPage';
import { SettingsLayout } from './layouts/SettingsLayout';
import { ProviderConfigPage } from './pages/settings/ProviderConfigPage';
import { AgentsPage } from './pages/settings/AgentsPage';
import { ArchivedBooksPage } from './pages/settings/ArchivedBooksPage';
import { MemoryConfigPage } from './pages/settings/MemoryConfigPage';
import { DatabaseViewerPage } from './pages/settings/DatabaseViewerPage';
import { WorldSettingPage } from './pages/workspace/WorldSettingPage';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        element: <AppLayoutWrapper />,
        children: [
          { index: true, element: null },
          { path: 'new-book', element: <NewBookPage /> },
          {
            path: 'books/:bookId',
            element: <BookWorkspaceLayout />,
            children: [
              { index: true, element: null },
              { path: 'overview', element: <OverviewPage /> },
              { path: 'world', element: <WorldPage /> },
              { path: 'world/settings/new', element: <WorldSettingPage /> },
              { path: 'world/settings/:settingId', element: <WorldSettingPage /> },
              { path: 'outline', element: <OutlinePage /> },
              { path: 'writing', element: <WritingPage /> },
              { path: 'review', element: <ReviewPage /> },
              { path: 'reading', element: <ReadingPage /> },
               { path: 'chat', element: null },
            ],
          },
        ],
      },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="/settings/llm" replace /> },
          { path: 'llm', element: <ProviderConfigPage /> },
          { path: 'agents', element: <AgentsPage /> },
          { path: 'archived', element: <ArchivedBooksPage /> },
          { path: 'memory', element: <MemoryConfigPage /> },
          ...(import.meta.env.DEV ? [{ path: 'database', element: <DatabaseViewerPage /> }] : []),
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="novel-studio-theme">
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
