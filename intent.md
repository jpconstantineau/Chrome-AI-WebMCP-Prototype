# Intent

This repository is a minimal prototype for exploring two ideas in a browser-first environment:

- Using the Chrome Prompt API (and other browser-local AI surfaces) to interact with the user in a conversational workflow.
- Using WebMCP browser tools to read and manipulate the current page from the local Chrome AI Prompt API.

The application is intended to be a testbed for local AI workflows inside Chrome. It should work as a PWA, store user preferences locally, and persist prototype data in IndexedDB without relying on a backend service or external API.

In order to work with something substantial the core application is a list manager inspired from Jira (https://tomitribe.com/blog/its-easy-the-anatomy-of-a-jira-issue/), Remember The Milk, Toodledo, Todoist, TickTick and CLickup.  Each item has details and can have a parent/child relationship with a sub-item.

## Application Loading, checks and approval

When the application loads, it first checks if the following are available:
1 - Chrome AI API: Prompt API
2 - WebMCP API

If either of the two aren't available, the application stops with an error on the page indicating that the necessary APIs are not available in this browser.

When both are available and the AI model is not yet downloaded, ask the user for permission to download the model. 
The Permission page should look similar to this: https://raw.githubusercontent.com/GoogleChromeLabs/webmcp-extension/refs/heads/main/docs/screenshots/consent.png

Once approved, the AI model is downloaded and other local preparation steps are completed (Prepare IndexedDB)

## Application Main Screen

### Side Bar: Hierarchy Tree View

This Tree view selects how main content area displays information.
When selecting a "container" item, the main screen will show the filtered list.
When selecting a leaf item, the main screen will show the details of that item with all its attributes.

Root
 |
 |-- INBOX
 |    |
 |    |- Item 1
 |    |- Item 2
 |    |- Item 3
 | 
 |-- Projects
 |    |
 |    |- Project 1
 |    |   |
 |    |   |- Task 1
 |    |   |- Task 2
 |    |   |- Task 3
 |    |
 |    |- Project 2
 |    |   |
 |    |   |- Task 1
 |    |   |- Task 2
 |    |   |- Task 3
 |    |
 |    |- Project 3
 |
 |-- Shopping Lists 
 |    |
 |    |- Groceries
 |    |   |
 |    |   |- Bananas
 |    |   |- Carrots
 |    |
 |    |- Hardware Store
 |    |   |
 |    |   |- screws
 

### Main Content Area: Filtered List or Item Details

When viewing a list, it should look similar to this: https://us1.discourse-cdn.com/asana/original/3X/9/f/9f653515b9c4d8612c4cbe570767ea1f608a0d14.png
When viewing a detailed item, it should look similar to this: https://tomitribe.com/wp-content/uploads/2019/03/Image-2.5-JIRA-EPIC-2.5-768x964.png

### Side Panel: AI Agent Chat and AI Tools

This side panel is where the user interacts with the AI Agent.  When in normal chat mode, the side panel should look similar to this: https://github.com/GoogleChromeLabs/webmcp-extension/blob/main/docs/screenshots/chat.png?raw=true

When first interacting with the WebMCP _tools, a request should show up similar to this: https://github.com/GoogleChromeLabs/webmcp-extension/blob/main/docs/screenshots/permission.png?raw=true

When the agent needs to take an action that is potentially destructive, a request should show up similar to this: https://github.com/GoogleChromeLabs/webmcp-extension/blob/main/docs/screenshots/consequential.png?raw=true

To help diagnose issues, an option should be available to show available tools and should look similar to this: https://github.com/GoogleChromeLabs/webmcp-extension/blob/main/docs/screenshots/tools.png?raw=true

These interaction patterns are from this repo https://github.com/GoogleChromeLabs/webmcp-extension


## Items Attributes

- Type: What type of item this represents
- Title: Brief description
- Description: More detailed description of what needs to be done, the outcome, what calls this as done
- Status: label indicating state of item: Open, In Progress, Completed, Waiting For, Blocked
- Context: indication on what must be true for this task to be able to be done. Generally related to location. @Home, @work, etc
- Parent Item: link to Parent item


### Available Types
- Project
- Role
- Area of Responsibility
- Checklist
- Shopping List
- Task

## Potentially Available Tools
 
This is a potential list of WebMCP tools.  When they are available on the page depends on the operational context of the page and is not yet known.

- List & Item Operations: List, Create, Read, Update, Delete
- Attributes Operations: List available attributes, Read, Update.
- Relationship Operations: Link/Unlink


## AI Assisted GTD Workflow: Weekly Review

The intent of this prototype is for developing a local harness where the AI Agent within the Prompt API interacts with the pages through WebMCP.  It works the user through a guided weekly review where it goes through these steps:

- GET CLEAR
    - Collect loose papers and materials
    - Get “In” to zero
    - Empty your head

- GET CURRENT
    - Review Action Lists
    - Review past calendar data
    - Review upcoming calendar
    - Review Waiting For list
    - Review Project (and larger outcome) lists
    - Review any relevant checklists

- GET CREATIVE
    - Review Someday/Maybe
    - Be creative & courageous

During each phase, the model adjusts the views, asks specific questions, the user answers them, the model adjusting the items as directed by the user and once a step is completed, moves on to the next step.

There is a potential "orchestrating" Agent that drives the overall weekly review, and a "more detailed" agent that works with the user for a specific step.