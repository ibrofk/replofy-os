import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Layers3, Search, Sparkles, FileText, Share2, FileUp, X, Menu, ArrowLeft, TerminalSquare, Folder, FolderPlus, MoreHorizontal } from 'lucide-react';
import { db, auth } from '../firebase';
import { useUser } from '../contexts/UserContext';
import { ContextSource, ContextSourceFolder, ContextSourceVersion } from '../types';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { FileIngestionPanel } from '../components/context/FileIngestionPanel';
import { PromptBankPanel } from '../components/context/PromptBankPanel';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { StudioHeader } from '../components/ui/StudioHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { EditorToolbar } from '../components/ui/EditorToolbar';
import { Modal } from '../components/ui/Modal';

type ViewFilter = 'all' | 'active' | 'archived';
type SourceMenuState = { source: ContextSource; x: number; y: number } | null;

export function ContentStudioPage() {
  const { userProfile } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [folders, setFolders] = useState<ContextSourceFolder[]>([]);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
  const [sourceMenu, setSourceMenu] = useState<SourceMenuState>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<ContextSourceVersion | null>(null);
  const [isVersionLoading, setIsVersionLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(() => {
    return searchParams.get('sourceId') || null;
  });
  
  // Mobile responsive states
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showPromptBank, setShowPromptBank] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const scopeQuery = userProfile?.companyId
      ? query(collection(db, 'contextSources'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'contextSources'), where('authorId', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(
      scopeQuery,
      (snapshot) => {
        const data = snapshot.docs.map((snap) => ({
          id: snap.id,
          ...snap.data(),
        })) as ContextSource[];
        setSources(data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'contextSources');
      }
    );

    return unsubscribe;
  }, [userProfile?.companyId]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const scopeQuery = userProfile?.companyId
      ? query(collection(db, 'contextSourceFolders'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'contextSourceFolders'), where('authorId', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(
      scopeQuery,
      (snapshot) => {
        const data = snapshot.docs.map((snap) => ({
          id: snap.id,
          ...snap.data(),
        })) as ContextSourceFolder[];
        setFolders(data.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'contextSourceFolders');
      }
    );

    return unsubscribe;
  }, [userProfile?.companyId]);

  const filteredSources = useMemo(() => {
    let result = sources;
    if (viewFilter === 'active') result = result.filter(s => s.status === 'active');
    if (viewFilter === 'archived') result = result.filter(s => s.status === 'archived');
    if (selectedFolderId === 'unfiled') result = result.filter(s => !s.folderId);
    if (selectedFolderId && selectedFolderId !== 'unfiled') result = result.filter(s => s.folderId === selectedFolderId);
    
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((source) => {
        const haystack = [source.title, source.latestFileName, source.latestSummary, ...(source.aliases || [])].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [search, selectedFolderId, sources, viewFilter]);

  const selectedSource = useMemo(() => sources.find(s => s.id === selectedSourceId), [sources, selectedSourceId]);

  useEffect(() => {
    let cancelled = false;
    setSelectedVersion(null);
    if (!selectedSourceId || !auth.currentUser) return;

    const loadLatestVersion = async () => {
      setIsVersionLoading(true);
      try {
        const scopeQuery = userProfile?.companyId
          ? query(
              collection(db, 'contextSourceVersions'),
              where('companyId', '==', userProfile.companyId),
              where('sourceId', '==', selectedSourceId),
            )
          : query(
              collection(db, 'contextSourceVersions'),
              where('authorId', '==', auth.currentUser!.uid),
              where('sourceId', '==', selectedSourceId),
            );
        const snapshot = await getDocs(scopeQuery);
        const latest = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() }) as ContextSourceVersion)
          .sort((left, right) => right.version - left.version)[0] ?? null;
        if (!cancelled) setSelectedVersion(latest);
      } catch (error) {
        logFirestoreError(error, OperationType.GET, 'contextSourceVersions');
      } finally {
        if (!cancelled) setIsVersionLoading(false);
      }
    };

    void loadLatestVersion();
    return () => {
      cancelled = true;
    };
  }, [selectedSourceId, userProfile?.companyId]);

  useEffect(() => {
    const urlSourceId = searchParams.get('sourceId');
    if (urlSourceId && sources.length > 0 && !selectedSourceId) {
      setSelectedSourceId(urlSourceId);
    }
  }, [sources, searchParams, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId) {
      setSearchParams({ sourceId: selectedSourceId }, { replace: true });
    } else {
      const params = new URLSearchParams(searchParams);
      params.delete('sourceId');
      setSearchParams(params, { replace: true });
    }
  }, [selectedSourceId, setSearchParams, searchParams]);

  const moveSourceToFolder = async (sourceId: string, folderId: string | null) => {
    await updateDoc(doc(db, 'contextSources', sourceId), {
      folderId,
      updatedAt: new Date().toISOString(),
    });
    setSourceMenu(null);
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name || !auth.currentUser) return;
    const ref = doc(collection(db, 'contextSourceFolders'));
    await setDoc(ref, {
      id: ref.id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authorId: auth.currentUser.uid,
      companyId: userProfile?.companyId ?? null,
    } satisfies ContextSourceFolder);
    setFolderName('');
    setFolderModalOpen(false);
    setSelectedFolderId(ref.id);
    setViewFilter('all');
  };

  const handleFolderDrop = async (folderId: string | null) => {
    if (!draggedSourceId) return;
    await moveSourceToFolder(draggedSourceId, folderId);
    setDraggedSourceId(null);
  };

  const folderCount = (folderId: string | null) => sources.filter((source) => folderId ? source.folderId === folderId : !source.folderId).length;
  const selectedFolderName = selectedFolderId === 'unfiled'
    ? 'Unfiled'
    : folders.find((folder) => folder.id === selectedFolderId)?.name;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden text-zinc-950 font-sans shadow-none md:shadow-sm md:border border-zinc-200">
      
      {/* Studio Header */}
      <StudioHeader
        badge="Content Studio"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="Content Studio"
        leftAction={
          <button 
            onClick={() => setShowMobileNav(!showMobileNav)}
            className="md:hidden p-1.5 text-zinc-500 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg shadow-sm focus:outline-none"
          >
            <Menu className="w-4 h-4" />
          </button>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPromptBank(!showPromptBank)}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showPromptBank ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              Prompt Bank
            </button>
            <div className="w-40 sm:w-56">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search docs..."
              />
            </div>
          </div>
        }
      />

      {/* 
        Main layout area
      */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/*
          Column 1: Sidebar Navigation
          Mobile: Slides in over content.
          Desktop: Fixed width 220px.
        */}
        <nav className={`
          absolute inset-y-0 left-0 z-30 bg-zinc-50 border-r border-zinc-200 w-56 flex flex-col shrink-0 transition-transform duration-200
          ${showMobileNav ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0 md:static md:shadow-none'}
        `}>
          <div className="flex items-center justify-between p-4 md:hidden border-b border-zinc-200">
              <span className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">Menu</span>
             <button onClick={() => setShowMobileNav(false)} className="p-1 text-zinc-400 hover:text-zinc-900"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-3 space-y-6 flex-1 overflow-y-auto">
            <div>
              <div className="mb-2 flex items-center justify-between px-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Library</h3>
                <button title="Create folder" onClick={() => setFolderModalOpen(true)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200/40 hover:text-zinc-900">
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-0.5">
                {[
                  { id: 'all', label: 'All Sources', icon: BookOpen, count: sources.length },
                  { id: 'active', label: 'Healthy', icon: Sparkles, count: sources.filter(s => s.status === 'active').length },
                  { id: 'archived', label: 'Archived', icon: Layers3, count: sources.filter(s => s.status === 'archived').length },
                ].map(nav => (
                  <li key={nav.id}>
                    <button
                      onClick={() => {
                        setViewFilter(nav.id as ViewFilter);
                        setSelectedFolderId(null);
                        setSelectedSourceId(null);
                        setShowMobileNav(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                        viewFilter === nav.id && !showPromptBank ? 'bg-zinc-200/60 text-zinc-900 font-semibold shadow-sm' : 'text-zinc-600 hover:bg-zinc-200/30'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                         <nav.icon className={`w-3.5 h-3.5 ${viewFilter === nav.id && !showPromptBank ? 'text-zinc-700' : 'text-zinc-400'}`} />
                         {nav.label}
                      </div>
                      {nav.count > 0 && <span className="text-[10px] bg-white border border-zinc-200 px-1.5 rounded text-zinc-500 font-bold">{nav.count}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between px-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Folders</h3>
                <span className="text-[10px] font-bold text-zinc-400">{folders.length}</span>
              </div>
              <ul className="space-y-0.5">
                <FolderNav
                  label="Unfiled"
                  count={folderCount(null)}
                  active={selectedFolderId === 'unfiled'}
                  onClick={() => {
                    setSelectedFolderId('unfiled');
                    setViewFilter('all');
                    setSelectedSourceId(null);
                    setShowMobileNav(false);
                  }}
                  onDrop={() => void handleFolderDrop(null)}
                />
                {folders.map((folder) => (
                  <FolderNav
                    key={folder.id}
                    label={folder.name}
                    count={folderCount(folder.id)}
                    active={selectedFolderId === folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setViewFilter('all');
                      setSelectedSourceId(null);
                      setShowMobileNav(false);
                    }}
                    onDrop={() => void handleFolderDrop(folder.id)}
                  />
                ))}
              </ul>
            </div>

            {/* Mobile Prompt Bank Toggle */}
            <div className="md:hidden">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400 mb-2 px-2">Tools</h3>
              <button
                onClick={() => {
                  setShowPromptBank(true);
                  setShowMobileNav(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${showPromptBank ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-200/30'}`}
              >
                <TerminalSquare className={`w-3.5 h-3.5 ${showPromptBank ? 'text-zinc-300' : 'text-zinc-400'}`} />
                Prompt Bank
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile Sidebar Overlay */}
        {showMobileNav && (
          <div 
            className="absolute inset-0 bg-zinc-950/20 backdrop-blur-sm z-20 md:hidden"
            onClick={() => setShowMobileNav(false)}
          />
        )}

        {/* Dynamic Content Area (Column 2 & 3 Logic) */}
        {!showPromptBank ? (
          <>
            {/* 
              Column 2: Document List
              Mobile: Hidden if a document is selected.
              Desktop: Always visible. Width 280px.
            */}
            <div className={`
              bg-white border-r border-zinc-200 flex flex-col shrink-0 transition-transform w-full md:w-72 lg:w-80
              ${selectedSourceId ? 'hidden md:flex' : 'flex'}
            `}>
              {/* Studio Header */}
              <StudioHeader
                badge="Content Library"
                badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
                title={selectedFolderName ? selectedFolderName : 'Documents'}
                actions={
                  <button onClick={() => setFolderModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100">
                    <FolderPlus className="h-3.5 w-3.5" />
                    Folder
                  </button>
                }
              />
              
              <div className="border-b border-zinc-100 px-4 py-2 bg-zinc-50 flex justify-between items-center shrink-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em]">Name</span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em]">Ver</span>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {filteredSources.length === 0 ? (
                   <EmptyState icon={<Search className="w-6 h-6 text-zinc-300" />} title="No results found" subtitle="Try adjusting your search or filters." />
                ) : (
                   <div className="flex flex-col">
                     {filteredSources.map(source => (
                       <button
                         key={source.id}
                         draggable
                         onDragStart={() => setDraggedSourceId(source.id)}
                         onDragEnd={() => setDraggedSourceId(null)}
                         onContextMenu={(event) => {
                           event.preventDefault();
                           setSourceMenu({ source, x: event.clientX, y: event.clientY });
                         }}
                         onClick={() => setSelectedSourceId(source.id)}
                         className={`group w-full border-b border-l-2 border-zinc-200 px-4 py-3 text-left transition-colors ${
                           selectedSourceId === source.id
                             ? 'relative z-10 border-l-zinc-900 bg-white shadow-sm'
                             : 'border-l-transparent bg-transparent hover:bg-white'
                         }`}
                       >
                         <div className="mb-1 flex items-start justify-between gap-2">
                           <span className={`truncate text-xs font-semibold ${selectedSourceId === source.id ? 'text-zinc-900' : 'text-zinc-700'}`}>{source.title}</span>
                           <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
                         </div>
                         <p className="mb-2 mt-1 line-clamp-2 text-xs font-normal leading-relaxed text-zinc-500">{source.latestFileName}</p>
                         <div className="flex items-center gap-2">
                           {source.folderId && <span className="inline-flex items-center gap-1 rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500"><Folder className="h-3 w-3" />{folders.find((folder) => folder.id === source.folderId)?.name || 'Folder'}</span>}
                           <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">v{source.latestVersion}</span>
                         </div>
                       </button>
                     ))}
                   </div>
                )}
              </div>
            </div>

            {/* 
              Column 3: Preview Area
              Mobile: Full width, active when selectedSourceId is true.
              Desktop: Fills remaining space.
            */}
            <div className={`
              flex-1 bg-zinc-50/50 flex flex-col overflow-hidden relative
              ${selectedSourceId ? 'flex' : 'hidden md:flex'}
            `}>
              {selectedSource ? (
                <div className="flex-1 overflow-y-auto">
                  {/* Header Bar */}
                  <EditorToolbar
                    badge="Preview"
                    leftActions={
                      <button 
                        onClick={() => setSelectedSourceId(null)} 
                        className="p-1.5 -ml-1.5 hover:bg-zinc-100 flex items-center justify-center rounded text-zinc-500 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4"/>
                      </button>
                    }
                    rightActions={
                      <span className="text-[10px] font-mono border px-1.5 py-0.5 rounded border-zinc-200 text-zinc-400 bg-white">v{selectedSource.latestVersion}</span>
                    }
                  />

                  <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start">
                      <div className="w-16 h-20 sm:w-20 sm:h-24 bg-white border border-zinc-200 rounded-[2rem] shadow-sm flex items-center justify-center shrink-0 relative">
                        <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-zinc-300" />
                        <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-bold px-2 rounded shadow-sm">v{selectedSource.latestVersion}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-600 text-[10px] font-bold uppercase tracking-[0.24em] rounded">{selectedSource.status}</span>
                          <span className="text-xs text-zinc-400 font-medium">{new Date(selectedSource.updatedAt).toLocaleString()}</span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight leading-tight mb-1 break-words">{selectedSource.title}</h2>
                        <p className="text-xs md:text-sm font-mono text-zinc-500 truncate">{selectedSource.latestFileName}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Summary */}
                      <div className="md:col-span-2 bg-white border border-zinc-200 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow">
                        <div className="px-4 py-2 border-b border-zinc-100 bg-zinc-50/50 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.24em]">
                           Context Summary
                        </div>
                        <div className="p-4 text-sm leading-relaxed text-zinc-700">
                          {selectedSource.latestSummary || <span className="text-zinc-400 italic">No summary generated.</span>}
                        </div>
                      </div>

                      <div className="md:col-span-2 bg-white border border-zinc-200 rounded-[2rem] shadow-sm overflow-hidden">
                        <div className="px-4 py-2 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between gap-3">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.24em]">Source Content</span>
                          {!isVersionLoading && (
                            <Badge>
                              {selectedVersion?.contentStorage === 'full'
                                ? 'Full text saved'
                                : selectedVersion?.contentStorage === 'preview-only'
                                  ? 'Preview only'
                                  : 'Re-upload required'}
                            </Badge>
                          )}
                        </div>
                        <div className="max-h-96 overflow-auto p-4">
                          {isVersionLoading ? (
                            <p className="text-sm text-zinc-400">Loading source version...</p>
                          ) : selectedVersion?.contentStorage === 'full' && selectedVersion.fullContent ? (
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-700">
                              {selectedVersion.fullContent}
                            </pre>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm font-medium text-zinc-700">
                                {selectedVersion?.contentStorage === 'preview-only'
                                  ? 'This file format only stores a preview.'
                                  : 'This legacy source needs to be uploaded again.'}
                              </p>
                              {selectedVersion?.contentPreview && (
                                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-500">
                                  {selectedVersion.contentPreview}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Aliases */}
                      <div className="bg-white border border-zinc-200 rounded-[2rem] p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em] mb-3">Lookup Aliases</span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {selectedSource.aliases.length > 0 ? selectedSource.aliases.map(alias => (
                            <span key={alias} className="px-2 py-1 bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600 rounded-md">{alias}</span>
                          )) : <span className="text-xs text-zinc-400">None</span>}
                        </div>
                      </div>

                      {/* Linkages */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-zinc-200 rounded-[2rem] p-4 shadow-sm flex flex-col items-center justify-center text-center">
                          <Layers3 className="w-5 h-5 text-zinc-300 mb-2" />
                          <div className="text-2xl font-black text-zinc-900 leading-none">{selectedSource.linkedTaskIds.length + selectedSource.linkedCycleGoalIds.length}</div>
                          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.24em] mt-1">Tasks Linked</div>
                        </div>
                        <div className="bg-white border border-zinc-200 rounded-[2rem] p-4 shadow-sm flex flex-col items-center justify-center text-center">
                          <Share2 className="w-5 h-5 text-zinc-300 mb-2" />
                          <div className="text-2xl font-black text-zinc-900 leading-none">
                            {selectedSource.linkedFeedbackIds.length + selectedSource.linkedSocialPostIds.length + (selectedSource.linkedLeadIds?.length || 0) + (selectedSource.linkedAccountIds?.length || 0)}
                          </div>
                          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.24em] mt-1">Times Reused</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                  <div className="max-w-md w-full text-center">
                    <div className="w-16 h-16 rounded-full border-2 border-zinc-200 border-dashed bg-white flex items-center justify-center mx-auto mb-4">
                      <FileUp className="w-6 h-6 text-zinc-300" />
                    </div>
                    <h2 className="text-lg font-bold text-zinc-900">Upload to Content Context</h2>
                    <p className="text-sm text-zinc-500 mt-2 mb-6">Select a document from the queue or securely upload a new source file below.</p>
                    <div className="text-left">
                      <FileIngestionPanel userProfile={userProfile!} mode="library" className="border-zinc-200 shadow-xl bg-white rounded-2xl" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Prompt Bank Full View Layer */
          <div className="flex-1 bg-white overflow-y-auto relative animate-in fade-in duration-200 z-10 w-full flex flex-col">
            <EditorToolbar
              badge="Prompt Bank"
              title="Global Library"
              rightActions={
                <button onClick={() => setShowPromptBank(false)} className="text-zinc-500 hover:text-zinc-900 p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              }
            />
            <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
               {/* Prompt Bank Component takes over */}
               <PromptBankPanel />
            </div>
          </div>
        )}

      </div>
      {sourceMenu && (
        <div className="fixed inset-0 z-[90]" onClick={() => setSourceMenu(null)}>
          <div
            className="absolute w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
            style={{ left: sourceMenu.x, top: sourceMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-zinc-100 px-3 py-2">
              <p className="truncate text-xs font-black text-zinc-900">{sourceMenu.source.title}</p>
              <p className="text-[11px] text-zinc-400">Move to folder</p>
            </div>
            <button onClick={() => void moveSourceToFolder(sourceMenu.source.id, null)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
              <Folder className="h-3.5 w-3.5" /> Unfiled
            </button>
            {folders.map((folder) => (
              <button key={folder.id} onClick={() => void moveSourceToFolder(sourceMenu.source.id, folder.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                <Folder className="h-3.5 w-3.5" /> {folder.name}
              </button>
            ))}
            <button onClick={() => { setSourceMenu(null); setFolderModalOpen(true); }} className="flex w-full items-center gap-2 border-t border-zinc-100 px-3 py-2 text-left text-xs font-bold text-zinc-900 hover:bg-zinc-50">
              <FolderPlus className="h-3.5 w-3.5" /> New folder
            </button>
          </div>
        </div>
      )}
      <Modal
        open={folderModalOpen}
        title="Create Folder"
        description="Create a folder for organizing Docs sources."
        onClose={() => setFolderModalOpen(false)}
        footer={(
          <>
            <button onClick={() => setFolderModalOpen(false)} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold">Cancel</button>
            <button onClick={() => void createFolder()} className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white">Create</button>
          </>
        )}
      >
        <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
      </Modal>
    </div>
  );
}

function FolderNav({ label, count, active, onClick, onDrop }: { key?: React.Key; label: string; count: number; active: boolean; onClick: () => void; onDrop: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <li>
      <button
        onClick={onClick}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onDrop();
        }}
        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
          active || dragOver ? 'bg-zinc-200/70 font-semibold text-zinc-900 shadow-sm' : 'text-zinc-600 hover:bg-zinc-200/30'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Folder className={`h-3.5 w-3.5 shrink-0 ${active || dragOver ? 'text-zinc-700' : 'text-zinc-400'}`} />
          <span className="truncate">{label}</span>
        </div>
        {count > 0 && <span className="rounded border border-zinc-200 bg-white px-1.5 text-[10px] font-bold text-zinc-500">{count}</span>}
      </button>
    </li>
  );
}
