/** Which chat is on screen right now, so a push for that same chat doesn't pop a banner over it. */
let activeChatId: string | null = null;

export const setActiveChat = (id: string | null) => { activeChatId = id; };
export const getActiveChat = () => activeChatId;
