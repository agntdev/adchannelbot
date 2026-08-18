# Channel Ad Poster Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that automatically publishes ads to a configured channel from either a remote feed (RSS/JSON) or manual admin submissions. The bot validates content, avoids duplicates, and provides admin notifications for all actions.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram channel owner
- channel subscribers

## Success criteria

- Ad posted to channel with correct formatting
- Duplicate ads blocked
- Admin notified of post success/failure
- Feed polled at configured interval

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open admin dashboard with channel status and recent posts
- **/add** (command, actor: admin, command: /add) — Submit new manual ad with text/media/link
  - inputs: ad text, media file, link
  - outputs: confirmation message with post preview
- **View Recent Ads** (button, actor: admin, callback: ads:recent) — Show last 10 posted ads with delete/repost options

## Flows

### Manual Ad Submission
_Trigger:_ /add

1. Admin sends /add command
2. Bot prompts for ad content
3. Admin provides text/media/link
4. Bot validates content and formats post
5. Bot publishes to channel
6. Bot sends confirmation to admin

_Data touched:_ Ad

### Feed Polling
_Trigger:_ scheduled poll

1. Bot polls configured feed every 5 minutes
2. New ad detected in feed
3. Bot validates and formats ad
4. Bot publishes to channel
5. Bot logs ad and sends admin confirmation

_Data touched:_ Ad, Feed

### Ad Management
_Trigger:_ button click

1. Admin views recent ads
2. Selects delete or repost action
3. Bot applies action and confirms

_Data touched:_ Ad

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram user ID allowed to manage ads
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.
- **FEED_URL** — RSS or JSON feed URL to monitor for new ads
  - may be UNSET at runtime: the bot must still start, and the feature needing FEED_URL must say so plainly instead of failing.
- **CHANNEL_ID** — Target Telegram channel for ad posts
  - may be UNSET at runtime: the bot must still start, and the feature needing CHANNEL_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Ad** _(retention: persistent)_ — Ad content and metadata
  - fields: title, body, image_url, video_url, link, source_type, timestamp, posted_status
- **Feed** _(retention: persistent)_ — Remote feed configuration and history
  - fields: feed_url, last_polled, item_hashes

## Integrations

- **Telegram** (required) — Bot API messaging and channel posting
- **Remote Feed** (required) — RSS/JSON feed polling
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure feed URL
- Set channel ID
- Approve/delete posts
- Adjust polling interval

## Notifications

- Post confirmation with ad preview
- Error alerts for failed posts
- Feed connection status updates

## Permissions & privacy

- All commands restricted to ADMIN_CHAT_ID
- Subscriber data not stored
- Ad content only visible to admin

## Edge cases

- Feed URL returns 404/500 errors
- Manual ad exceeds 5MB media limit
- Duplicate ad detected via hash check
- Channel post API rate limiting

## Required tests

- Verify manual ad submission workflow from admin command to channel post
- Confirm feed polling detects and publishes new items
- Validate duplicate prevention across feed/manual ads

## Assumptions

- Feed polling interval is 5 minutes
- Media files >5MB are rejected
- Admin-only interaction model
