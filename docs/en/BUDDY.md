# Buddies

> Not yet released: this page describes the current source. The full reference, including every edge case, is the [Chinese Buddy guide](../BOT_MODE.md).
>
> During development Buddies were called Bots. The API (`/api/pi/bots`), data directories (`OhMyBuddyBots/`) and the WeChat command `/bot` keep that name; WeChat also accepts `/buddy` and `/伙伴`.

A Buddy is a personal assistant with a name, a look and a personality. Each Buddy has one **main chat** that feels like talking to the same person over time, without projects, threads, model names or context compaction on screen. For project work with the full controls, use **Workspace**.

Every Buddy is built on an [assistant profile](../AGENT_PROFILES.md), so it has its own "About you" notes, long-term memory, skills, model and working folder. Buddies do not share these with each other.

## Getting started

When the server supports Buddies, **Buddy** appears in the navigation. With no Buddy yet, a welcome page offers **Get started**. A Buddy needs a chat model; if none is available, **Connect model** opens provider settings. By default a Buddy follows the workspace's effective default model, and you can pick its own model later.

The first time you open the main chat, the Buddy greets you locally (no model call). You can take a two-to-three-minute interview or skip it. The interview covers how to address you, what it mainly helps with, its name, its personality and its working style, one item at a time. Each setup card can be saved, edited or postponed. The Buddy only says it saved something after the save tool succeeded.

- **A second Buddy** can copy the "About you" notes you tick from another Buddy. The copy happens once; afterwards each Buddy keeps its own notes.
- **Make it a Buddy:** on the Identities page, an enabled identity can become a Buddy. It keeps its name, avatar, personality, memory and skills, gets its own main chat and working folder, and asks only what is still undecided. Earlier conversations stay in Workspace.
- **Use a Buddy in a real project:** in Workspace, choose **New thread as an identity…** in a project menu and pick the Buddy. The thread carries its personality, memory and skills, uses ordinary Workspace tools and permissions, and does not appear in the Buddy's chats.

Before you rely on a Buddy, open **Data, permissions & backup** on the welcome page, in the greeting or in settings. Chats, memory and files live on the machine that runs OhMyBuddy, and replies send relevant context to the model provider you configured.

## Main chat

The Buddy's avatar and name tag float at the top of the chat. Your messages appear on the right, its replies on the left. Each turn keeps **one reply bubble**. Intermediate notes, thinking and tool steps fold into a single process line ("Took 7s · 3 steps"), which you can expand to review steps, arguments and output.

Below a reply, receipts show what changed in that turn: notebook entries, memory, skills, settings and scheduled tasks. **View** opens the matching notebook, profile page or settings. Knowledge receipts can be undone, marked wrong or edited. Files the Buddy hands you appear as file cards you can preview or download.

Buddies can read and write files, run commands, use the web and use your configured tools, like any Pi agent. Files they create go to their own working folder: `<location>/OhMyBuddyBots/bot-<first 8 characters of the ID>/`, where the location is your home folder (if it is inside an allowed project root) or the first project root.

## Topics

Besides the main chat, a Buddy can have up to 100 topics, including archived ones. **New topic** opens a fresh conversation. After the first exchange it gets a name and a focus, which you can edit. Each topic starts empty, shares the Buddy's personality, model and long-term memory, and keeps its own history and notebook.

A topic can have optional instructions (up to 8 KB) that apply from the next message, still within the Buddy's working style and safety rules. Archived topics keep their history and can be restored. The main chat cannot be renamed or archived.

## What I'm keeping in mind

Every chat has its own notebook for **Promises** (who promised what, and by when), **Open questions**, **Decided** items, **Preferences** and **Things to keep in mind** such as names, numbers and dates. Cross-chat facts about you go to "About you" instead.

The Buddy writes entries as the conversation happens, and idle summaries check them against your original words. Only things you said count as decided or as your preferences. You can complete, edit, reschedule, mark as no longer needed or delete entries. Deleted entries are not re-added from old messages. **Source** shows the message an entry came from.

## Long conversations

The main chat is meant to last. OhMyBuddy maintains it in the background:

1. After a reply, old long tool output beyond the last few turns is replaced by a short note when that saves enough context.
2. When the chat has been idle for a while and the context is fairly full, the Buddy's own model writes a structured summary and syncs the notebook. If that fails, Pi's native summary is used.
3. When a session file grows large, old or long, the chat continues in a new native session file right after a summary. Nothing is deleted.

Earlier parts appear above the current chat as read-only **Earlier conversation** sections. The Buddy can search the original wording of earlier generations when you ask about them. WeChat messages count as your own words for recall, summaries and learning.

## Settings

Click the avatar at the top of the chat, or "{name}'s settings" at the bottom of the chat list.

| Section | What you set |
|---|---|
| Profile | Name, built-in avatar (Pebble, Bean or Tile) or your own image, what it mainly helps with, and personality |
| Model | Model and thinking level, saved separately; each can follow the default. Applies to the main chat and every topic. WeChat `/model` and `/thinking` share these settings |
| How it works | Working style: Hands-off, Careful or Ask every time, plus the things you have chosen to always allow |
| Reaching out | Proactive messages, quiet hours, daily push limit, planned follow-ups and recent activity |
| WeChat | Connect or disconnect allowed WeChat users |
| Learning & memory | Background learning on or off, daily model-call limits, and links to memory and "About you" |
| More | Data and permission notes, **Get acquainted again**, and **Move to trash** (restorable from the Identities page) |

Unsaved changes are protected when you close settings or navigate away.

## Working styles

| Style | Does directly | Asks you first |
|---|---|---|
| Hands-off (default) | Practically full permissions: reading, web, memory, reminders, files, commands, installs | A short list: privilege escalation, recursive or disk-level deletion, shutdown and service control, destructive git operations, publishing, sending email, startup tasks, credential files and OhMyBuddy's own runtime directory, plus sending messages, spending money and changing its own permissions |
| Careful | Reading, web, memory, viewing schedules, writing files inside its working folder | Any command, schedules, other agents, files outside its working folder, OhMyBuddy/Pi state paths |
| Ask every time | Reading ordinary files, answering | Every other step |

A confirmation card shows the exact command, path or action. **Allow** permits that one step; **Don't**, cancelling or 30 minutes without an answer skips it. For understandable, non-dangerous commands or single-file writes you can choose **Always allow**. It only matches the same exact command or file, and you can revoke it in settings. Scheduled runs have nobody to ask, so steps that need confirmation are not run. Recognisable credential files and private keys need a confirmation every time under Hands-off and are refused under the other two styles; reading the whole environment (`env`, `printenv`) is always refused.

These checks happen in the tool layer. **They are not an operating-system sandbox**: allowed commands run with the permissions of the OhMyBuddy service, and dangerous steps hidden in complex scripts may not be recognised.

## Scheduled tasks and reaching out

Ask a Buddy in chat to create, list or cancel reminders and recurring tasks. It confirms the local time and time zone after the task is saved, and a task card offers **View / edit** and cancel. Tasks also appear on the [Scheduled tasks](../SCHEDULED_TASKS.md) page.

A Buddy can also start two kinds of text-only messages on its own:

- **Due promises:** promises with a deadline in the notebook. Date-only deadlines are followed up at 9:00 that day.
- **Check-backs:** a one-off "I'll check back" it schedules for itself, up to 60 days ahead, with at most 10 pending per Buddy.

In **Reaching out** you can turn these off, set quiet hours (default 23:00–08:00) and a daily push limit (default 20), and cancel planned follow-ups. Quiet hours and push limits only control notifications; they are not spending limits. Proactive messages have their own safety limit of 50 per Buddy per day.

## WeChat

After connecting WeChat under **Settings › Messaging channels** and allowing your WeChat user, open the Buddy's **WeChat** settings and connect that user. Messages from WeChat go to the main chat and replies come back to WeChat. One WeChat chat can connect several Buddies and talk to one at a time.

| Command | Meaning |
|---|---|
| `/bot`, `/buddy`, `/伙伴`, `/切换` `[number or name]` | List or switch Buddies |
| `/topic`, `/话题` `[number or name]`, `/topic main` | List or switch topics; `main` returns to the main chat |
| `/new [title]`, `/name <title>` | Start a new topic, or rename the current topic |
| `/status`, `/status detail` | Current Buddy, topic, model, working style and what it is waiting for |
| `/model …`, `/thinking …` (`default` to reset) | Show or save the Buddy's model and thinking level |
| `/stop`, `/confirm [card ID]` | Ask to stop; confirm a media card |
| `/help`, `/help advanced` | List commands |

When a step started from WeChat needs approval, WeChat receives the step and a short code such as A3. Reply "同意 A3" to allow it once or "拒绝 A3" to refuse. **Always allow** is only available in the browser. See [messaging channels (Chinese)](../MESSAGE_CHANNELS.md).

## Limits

- One main chat and up to 100 topics per Buddy; up to 50 Buddies and assistant profiles in total.
- Idle summaries call the Buddy's model and may cost money. Background learning uses the auxiliary model. There is no single spending cap for a whole Buddy.
- When a chat continues in a new session file, only text carries over, not tool output; the Buddy can search earlier generations when needed.
- WeChat does not offer the full settings form or long-term approvals.
- Recent activity is a bounded recent view, not a complete history.

For integrations, see the [API reference](../API.md#bot-模式).
