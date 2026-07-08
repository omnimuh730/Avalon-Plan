import { ProfileLoader } from './components/ProfileLoader';
import { EmailList } from './components/EmailList';
import { JobBidAssistant } from './components/JobBidAssistant';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { useGmail } from './hooks/useGmail';

export default function App() {
  const {
    emails,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    lastScanned,
    error,
    hasCredentials,
    refresh,
    loadMore,
  } = useGmail();

  return (
    <div className="size-full min-w-0 flex flex-col bg-background text-foreground">
      <ProfileLoader onLoaded={() => void refresh()} />
      <Tabs defaultValue="inbox" className="flex-1 min-h-0 gap-0">
        <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2">
          <TabsList className="w-full h-8 bg-muted/50 border border-border/60">
            <TabsTrigger value="inbox" className="flex-1 text-xs">
              Inbox
            </TabsTrigger>
            <TabsTrigger value="job-bid" className="flex-1 text-xs">
              Job Bid
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          forceMount
          value="inbox"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <EmailList
            emails={emails}
            loading={loading}
            refreshing={refreshing}
            loadingMore={loadingMore}
            hasMore={hasMore}
            lastScanned={lastScanned}
            error={error}
            hasCredentials={hasCredentials}
            onRefresh={refresh}
            onLoadMore={loadMore}
          />
        </TabsContent>

        <TabsContent
          forceMount
          value="job-bid"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <JobBidAssistant />
        </TabsContent>
      </Tabs>
    </div>
  );
}
