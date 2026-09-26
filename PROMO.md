# MCE Download v1.0.3

Welcome to **MCE Download** for Visual Studio Code. Connect to Salesforce Marketing Cloud to work with content, data extensions, journeys, automations, and queries. Share feedback in the [MCE Download repository](https://github.com/saransh-garg-vml/vscode-mce01).

```diff
+ === NEW FEATURES ===

+ Fetch full Journey details (via "Get Interactions (Journeys) - By ID") when a Journey folder is opened
+ Read-only "_activities.readonly.json" and "_triggers.readonly.json" files for each Journey
+ Read-only "_entryEvent.readonly.json" file with the Journey's entry event definition (via "Get Event Definitions - By Key")
+ Renamed "journey.json" to "completeJourney.json"
+ Data Extension Insights view: search a Data Extension and see its usage and data flow
```

### To run an SQL query
* Connect to your MC account
* Find your SQL Query asset in the "SQL Queries" folder and open a "query.sql" file
* Click a "Run SQL Query" button located in the top right corner of the editor (or run an "MCED: Run SQL Query" command from the Command Palette)

![SQL Queries](https://raw.githubusercontent.com/saransh-garg-vml/vscode-mce01/main/images/mcfs_runquery.jpg)


### To filter a Dataextension
* Connect to your MC account
* Find your Dataextension asset in the "Dataextensions" folder and open a "rows.csv" file
* Click a "Filter a Dataextension" button located in the top right corner of the editor (or run an "MCED: Filter a Dataextension" command from the Command Palette)
* Set the filter and hit enter
* Filter example: OrderID = 'ORD2123F2' AND SubscriberKey = 'ABC'

![Dataextensions](https://raw.githubusercontent.com/saransh-garg-vml/vscode-mce01/main/images/mcfs_filterde.jpg)


### To explore a Journey
* Connect to your MC account
* Open the "Journeys" folder and select a `<name>.journey` folder
* MCE Download calls the Journey Builder "Get Interactions - By ID" API and generates `completeJourney.json`, `_activities.readonly.json`, `_triggers.readonly.json` and `_entryEvent.readonly.json` for that Journey


# Direct connection to Marketing Cloud

## 1. Connect directly to your Marketing Cloud Account

With a quick 5 minutes setup you'll be able to edit content blocks, emails, cloudpages, dataextensions and SQL queries, and browse Automations and Journeys, without leaving Visual Studio Code. You can now avoid frequent copy-pasting and focus on your work. Have a look a quick demo below. To open Connection Manager:
* Press F1 (or 'CMD+Shift+P' on Mac and 'CTRL+Shift+P' on Windows)
* Start typing 'MCED'
* Find 'MCED: Connection Manager' and then press Enter
* You'll find detailed setup instructions there

![MCE Download](https://raw.githubusercontent.com/saransh-garg-vml/vscode-mce01/main/images/mcfs.gif)

## 1.a How to connect to Marketing Cloud

As of now, you **can only edit existing assets** (content blocks, emails, cloudpage and json message). Automations and Journeys are read-only. Functionality that is not supported at the moment: create new asset, rename asset, move asset to a different folder, delete asset.

* In your MC account, create a new installed package and add a 'Server-to-Server' API integration Component
* Add the following permissions:
	* CHANNELS: Email (Read and Write)
	* CHANNELS: Web (Read, Write, Publish)
	* ASSETS: Saved Content (Read and Write)
	* AUTOMATION: Automations (Read, Write, Execute)
	* DATA: Data Extensions (Read, Write)
* Grant access to all required BUs
* Provide package details in the connection manager below, save it and connect
* You'll find the entire Content Builder library in your File Explorer tab
* To open Connection Manager next time press F1 (or 'CMD+Shift+P' on Mac and 'CTRL+Shift+P' on Windows) and start typing 'MCED'. Find 'MCED: Connection Manager' and then hit Enter

Detailed instructions with screenshots are available directly in the Connection Manager. To open Connection Manager press F1 (or 'CMD+Shift+P' on Mac and 'CTRL+Shift+P' on Windows) and start typing 'MCED'. Find 'MCED: Connection Manager' and then hit Enter.

### Assets that you can work with
* Content Builder assets (Emails, Messages and Content Blocks)
* Landing Pages (created with Content Builder editor)
* Dataextensions (Edit data in dataextensions, apply filters, export to CSV etc.)
* SQL Queries (Edit queries and Run them)
* Automations (read-only, with normalized activity details)
* Journeys (read-only, with detailed activities and triggers)

### 1.b How to edit assets directly from Visual Studio Code

Each asset is presented as a folder that starts with an 'Ω' symbol. You can easily distinguish different asset types based on the colored square that goes after 'Ω':
* 🟥 - blocks
* 🟦 - emails
* 🟨 - templates
* 🟩 - cloudpages
* 🟪 - mobile messages
* 🟧 - automations

Each asset folder includes a readonly '__raw.readonly.json' file. This is an API representation of the asset. You can not modify. Instead you can modify all other files available under the asset folder. Each file represents a specific part of the asset. For the template based email you will see for example smth like: 
* _htmlcontent.amp - template used to create an email
* _subject.amp - subject line of the email
* _preheader.amp - preheader of the email
* s01.b01.content.amp - content of the first content block (b01) that is located in the first template stack/placeholder (s01)
* s01.b01.super.amp - super content of the block above. Learn more about super content [here](https://developer.salesforce.com/docs/atlas.en-us.noversion.mc-apis.meta/mc-apis/design_super_content.htm)
* s01.b02.content.amp - content of the second block in the first template stack
* s01.b02.super.amp - super content of the second block in the first template stack
* s02.b01.content.amp - content of the first block in the second template stack
* s02.b01.super.amp - super content of the first block in the second template stack

## 2. Hover code snippets

Now you can mouse hover a function name in your code and a small popup window including documentation on this function will show up. Check a small example below

![Hover snippets](https://raw.githubusercontent.com/saransh-garg-vml/vscode-mce01/main/images/screenshot_hoversnippets.jpg)
