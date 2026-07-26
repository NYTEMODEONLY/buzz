# Sidebar categories and manual channel order

Buzz Canary can group stream channels into named sidebar categories and keep
an exact user-defined order.

## Create and manage a category

1. Open the **More actions for Channels** menu.
2. Choose **New category...**, then enter a unique name and optional emoji.
3. Move channels with their **Move** control or drag them onto the category.
4. Open a category's menu to rename it, move it, or delete it.

Empty categories remain visible as drop targets. Deleting a category never
deletes or leaves its channels; they return to the built-in **Channels** group
in their existing relative order.

## Manual order

Open a stream group or category's sort menu and choose **Manual**. Drag a
channel grip to its exact position. With the keyboard, focus the grip, press
Space to pick up, use the arrow keys to move, then press Space to drop or
Escape to cancel.

Switching back to **A-Z** or **Recent** keeps the saved manual order for the
next time Manual is selected. Forums and direct messages continue to use A-Z
or Recent.

## Persistence and privacy

Categories, assignments, sort modes, and manual order are stored locally per
identity and community. Buzz also synchronizes them as encrypted NIP-78
application data:

- `channel-sections` stores categories and membership.
- `channel-sort` stores each group's selected sort mode.
- `channel-manual-order` stores channel IDs in exact group order.

Corrupt or missing order data fails safely to deterministic A-Z rendering and
cannot remove a channel or alter its membership.

Explicit local category edits remain authoritative while an initial or
reconnect fetch is in flight. Buzz observes the remote timestamp, publishes the
local edit with a strictly newer timestamp, and then resumes normal remote
updates.
