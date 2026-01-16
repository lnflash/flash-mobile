"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrFeed = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const pool_1 = require("@app/utils/nostr/pool");
const FeedItem_1 = require("./FeedItem");
const RELAYS = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
    "wss://relay.snort.social",
];
const NostrFeed = ({ userPubkey }) => {
    const styles = useStyles();
    const { theme } = (0, themed_1.useTheme)();
    const [events, setEvents] = (0, react_1.useState)([]);
    const [profiles, setProfiles] = (0, react_1.useState)(new Map());
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [refreshing, setRefreshing] = (0, react_1.useState)(false);
    const [since, setSince] = (0, react_1.useState)(Math.floor(Date.now() / 1000) - 86400);
    const fetchProfiles = (0, react_1.useCallback)(async (pubkeys) => {
        try {
            const uniquePubkeys = [...new Set(pubkeys)];
            const sub = pool_1.pool.subscribeMany(RELAYS, [
                {
                    kinds: [0],
                    authors: uniquePubkeys,
                },
            ], {
                onevent(event) {
                    try {
                        const profile = JSON.parse(event.content);
                        setProfiles((prev) => new Map(prev).set(event.pubkey, profile));
                    }
                    catch (e) {
                        console.log("Error parsing profile:", e);
                    }
                },
                oneose() {
                    sub.close();
                },
            });
        }
        catch (error) {
            console.error("Error fetching profiles:", error);
        }
    }, []);
    const fetchEvents = (0, react_1.useCallback)(async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
                setSince(Math.floor(Date.now() / 1000));
            }
            else {
                setLoading(true);
            }
            const fetchedEvents = [];
            const filter = {
                kinds: [1],
                limit: 50,
                since: isRefresh ? Math.floor(Date.now() / 1000) - 3600 : since,
            };
            if (userPubkey) {
                filter.authors = [userPubkey];
            }
            const sub = pool_1.pool.subscribeMany(RELAYS, [filter], {
                onevent(event) {
                    if (!fetchedEvents.find((e) => e.id === event.id)) {
                        fetchedEvents.push(event);
                    }
                },
                oneose() {
                    fetchedEvents.sort((a, b) => b.created_at - a.created_at);
                    if (isRefresh) {
                        setEvents(fetchedEvents);
                    }
                    else {
                        setEvents((prev) => {
                            const combined = [...fetchedEvents, ...prev];
                            const unique = combined.filter((event, index, self) => index === self.findIndex((e) => e.id === event.id));
                            return unique.sort((a, b) => b.created_at - a.created_at);
                        });
                    }
                    const pubkeys = fetchedEvents.map((e) => e.pubkey);
                    if (pubkeys.length > 0) {
                        fetchProfiles(pubkeys);
                    }
                    sub.close();
                    setLoading(false);
                    setRefreshing(false);
                },
            });
            setTimeout(() => {
                sub.close();
                setLoading(false);
                setRefreshing(false);
            }, 5000);
        }
        catch (error) {
            console.error("Error fetching events:", error);
            setLoading(false);
            setRefreshing(false);
        }
    }, [since, fetchProfiles, userPubkey]);
    (0, react_1.useEffect)(() => {
        fetchEvents();
    }, []);
    const onRefresh = () => {
        fetchEvents(true);
    };
    const renderItem = ({ item }) => (<FeedItem_1.FeedItem event={item} profile={profiles.get(item.pubkey)}/>);
    const ListEmptyComponent = () => {
        if (loading) {
            return (<react_native_1.View style={styles.emptyContainer}>
          <react_native_1.ActivityIndicator size="large" color={theme.colors.primary}/>
        </react_native_1.View>);
        }
        return (<react_native_1.View style={styles.emptyContainer}>
        <themed_1.Text style={styles.emptyText}>No posts yet</themed_1.Text>
        <themed_1.Text style={[styles.emptySubtext, { color: theme.colors.grey3 }]}>
          Pull to refresh
        </themed_1.Text>
      </react_native_1.View>);
    };
    return (<react_native_1.View style={styles.container}>
      <react_native_1.FlatList data={events} renderItem={renderItem} keyExtractor={(item) => item.id} refreshControl={<react_native_1.RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]}/>} ListEmptyComponent={ListEmptyComponent} contentContainerStyle={events.length === 0 ? styles.emptyList : undefined}/>
    </react_native_1.View>);
};
exports.NostrFeed = NostrFeed;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flex: 1,
        backgroundColor: colors.grey5,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
    },
    emptyList: {
        flexGrow: 1,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.black,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
    },
}));
//# sourceMappingURL=NostrFeed.js.map