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
    <div className="size-full bg-[#1a1a1a] flex flex-col">
      <ProfileLoader onLoaded={() => void refresh()} />
      <Tabs defaultValue="inbox" className="flex-1 min-h-0 gap-0">
        <div className="border-b border-gray-800 bg-[#202020] px-4 pt-3">
          <TabsList className="w-full bg-[#1a1a1a] border border-gray-800">
            <TabsTrigger value="inbox" className="flex-1">
              Inbox
            </TabsTrigger>
            <TabsTrigger value="job-bid" className="flex-1">
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
