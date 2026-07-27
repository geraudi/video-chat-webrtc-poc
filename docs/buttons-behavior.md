
| State | Button Label | Enabled Condition | What happens on click |
|-------|-------------|-------------------|----------------------|
| Waiting for websock connnection | "Start" | Disabled | - |
| Waiting for peer (not in chat) | "Start" | Enabled | Search for peer |
| Looking for peer (after Start clicked, not yet matched) | "Looking..." | Disabled | — |
| In active chat | "Next" | Enabled | Disconnect + immediately search for new peer |
| After Next clicked (disconnecting → re-searching) | "Looking..." | Disabled | — |