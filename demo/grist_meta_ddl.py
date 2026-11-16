"""Définition SQL des tables système d'un document Grist (schemaVersion 47, PRAGMA user_version = 9).

Copiée telle quelle depuis `test/fixtures/docs/Hello.grist` de grist-core (document créé par Grist 1.7.x), sans
ses tables utilisateur. Les tables `_grist_*` portent les métadonnées (tables, colonnes, pages, sections…),
les tables `_gristsys_*` l'historique et les fichiers joints.
"""
SCHEMA_VERSION = 47
USER_VERSION = 9

DDL = [
    'CREATE TABLE _gristsys_Files (id INTEGER PRIMARY KEY, ident TEXT UNIQUE, data BLOB, storageId TEXT)',
    'CREATE TABLE "_gristsys_Action" (id INTEGER PRIMARY KEY, "actionNum" BLOB DEFAULT 0, "time" BLOB DEFAULT 0, "user" BLOB DEFAULT "", "desc" BLOB DEFAULT "", "otherId" BLOB DEFAULT 0, "json" BLOB DEFAULT "", "linkId" BLOB DEFAULT null)',
    'CREATE TABLE "_gristsys_Action_step" (id INTEGER PRIMARY KEY, "parentId" BLOB DEFAULT 0, "type" BLOB DEFAULT "", "name" BLOB DEFAULT "", "tableId" BLOB DEFAULT "", "colIds" BLOB DEFAULT "", "rowIds" BLOB DEFAULT "", "values" BLOB DEFAULT "", "json" BLOB DEFAULT "")',
    'CREATE TABLE "_grist_DocInfo" (id INTEGER PRIMARY KEY, "docId" BLOB DEFAULT "", "peers" BLOB DEFAULT "", "schemaVersion" BLOB DEFAULT 0, "basketId" BLOB DEFAULT \'\', "timezone" BLOB DEFAULT \'\', "documentSettings" TEXT DEFAULT \'\')',
    'CREATE TABLE "_grist_Tables" (id INTEGER PRIMARY KEY, "tableId" BLOB DEFAULT "", "primaryViewId" BLOB DEFAULT 0, "summarySourceTable" BLOB DEFAULT 0, "onDemand" BLOB DEFAULT 0, "rawViewSectionRef" INTEGER DEFAULT 0, "recordCardViewSectionRef" INTEGER DEFAULT 0, "locked" BOOLEAN DEFAULT 0)',
    'CREATE TABLE "_grist_Tables_column" (id INTEGER PRIMARY KEY, "parentId" BLOB DEFAULT 0, "parentPos" BLOB DEFAULT 1e999, "colId" BLOB DEFAULT "", "type" BLOB DEFAULT "", "widgetOptions" BLOB DEFAULT "", "isFormula" BLOB DEFAULT 0, "formula" BLOB DEFAULT "", "label" BLOB DEFAULT "", "summarySourceCol" BLOB DEFAULT 0, "untieColIdFromLabel" BLOB DEFAULT 0, "displayCol" BLOB DEFAULT 0, "visibleCol" BLOB DEFAULT 0, "recalcWhen" INTEGER DEFAULT 0, "recalcDeps" BLOB DEFAULT NULL, "rules" TEXT DEFAULT NULL, "description" TEXT DEFAULT \'\', "reverseCol" INTEGER DEFAULT 0)',
    'CREATE TABLE "_grist_Imports" (id INTEGER PRIMARY KEY, "tableRef" BLOB DEFAULT 0, "origFileName" BLOB DEFAULT "", "delimiter" BLOB DEFAULT "", "doublequote" BLOB DEFAULT 0, "escapechar" BLOB DEFAULT "", "quotechar" BLOB DEFAULT "", "skipinitialspace" BLOB DEFAULT 0, "encoding" BLOB DEFAULT "", "hasHeaders" BLOB DEFAULT 0)',
    'CREATE TABLE "_grist_External_database" (id INTEGER PRIMARY KEY, "host" BLOB DEFAULT "", "port" BLOB DEFAULT 0, "username" BLOB DEFAULT "", "dialect" BLOB DEFAULT "", "database" BLOB DEFAULT "", "storage" BLOB DEFAULT "")',
    'CREATE TABLE "_grist_External_table" (id INTEGER PRIMARY KEY, "tableRef" BLOB DEFAULT 0, "databaseRef" BLOB DEFAULT 0, "tableName" BLOB DEFAULT "")',
    'CREATE TABLE "_grist_TableViews" (id INTEGER PRIMARY KEY, "tableRef" BLOB DEFAULT 0, "viewRef" BLOB DEFAULT 0)',
    'CREATE TABLE "_grist_TabItems" (id INTEGER PRIMARY KEY, "tableRef" BLOB DEFAULT 0, "viewRef" BLOB DEFAULT 0)',
    'CREATE TABLE "_grist_TabBar" (id INTEGER PRIMARY KEY, "viewRef" BLOB DEFAULT 0, "tabPos" BLOB DEFAULT 1e999)',
    'CREATE TABLE "_grist_Views" (id INTEGER PRIMARY KEY, "name" BLOB DEFAULT "", "type" BLOB DEFAULT "", "layoutSpec" BLOB DEFAULT "")',
    'CREATE TABLE "_grist_Views_section" (id INTEGER PRIMARY KEY, "tableRef" BLOB DEFAULT 0, "parentId" BLOB DEFAULT 0, "parentKey" BLOB DEFAULT "", "title" BLOB DEFAULT "", "defaultWidth" BLOB DEFAULT 0, "borderWidth" BLOB DEFAULT 0, "theme" BLOB DEFAULT "", "chartType" BLOB DEFAULT "", "layoutSpec" BLOB DEFAULT "", "filterSpec" BLOB DEFAULT "", "sortColRefs" BLOB DEFAULT "", "linkSrcSectionRef" BLOB DEFAULT 0, "linkSrcColRef" BLOB DEFAULT 0, "linkTargetColRef" BLOB DEFAULT 0, "embedId" BLOB DEFAULT \'\', "options" BLOB DEFAULT \'\', "rules" TEXT DEFAULT NULL, "description" TEXT DEFAULT \'\', "shareOptions" TEXT DEFAULT \'\')',
    'CREATE TABLE "_grist_Views_section_field" (id INTEGER PRIMARY KEY, "parentId" BLOB DEFAULT 0, "parentPos" BLOB DEFAULT 1e999, "colRef" BLOB DEFAULT 0, "width" BLOB DEFAULT 0, "widgetOptions" BLOB DEFAULT "", "displayCol" BLOB DEFAULT 0, "filter" BLOB DEFAULT \'\', "visibleCol" BLOB DEFAULT 0, "rules" TEXT DEFAULT NULL)',
    'CREATE TABLE "_grist_Validations" (id INTEGER PRIMARY KEY, "formula" BLOB DEFAULT "", "name" BLOB DEFAULT "", "tableRef" BLOB DEFAULT 0)',
    'CREATE TABLE "_grist_REPL_Hist" (id INTEGER PRIMARY KEY, "code" BLOB DEFAULT "", "outputText" BLOB DEFAULT "", "errorText" BLOB DEFAULT "")',
    'CREATE TABLE "_grist_Attachments" (id INTEGER PRIMARY KEY, "fileIdent" BLOB DEFAULT "", "fileName" BLOB DEFAULT "", "fileType" BLOB DEFAULT "", "fileSize" BLOB DEFAULT 0, "imageHeight" BLOB DEFAULT 0, "imageWidth" BLOB DEFAULT 0, "timeUploaded" BLOB DEFAULT null, "timeDeleted" DATETIME DEFAULT NULL, "fileExt" TEXT DEFAULT \'\')',
    'CREATE TABLE _gristsys_ActionHistory (\n          id INTEGER PRIMARY KEY,\n          actionHash TEXT UNIQUE,\n          parentRef INTEGER,\n          actionNum INTEGER,\n          body BLOB\n        )',
    'CREATE TABLE _gristsys_ActionHistoryBranch (\n          id INTEGER PRIMARY KEY,\n          name TEXT UNIQUE,\n          actionRef INTEGER\n        )',
    "CREATE TABLE _gristsys_FileInfo (\n          id INTEGER PRIMARY KEY CHECK (id = 0),\n          docId TEXT DEFAULT '',\n          ownerInstanceId TEXT DEFAULT ''\n        )",
    "CREATE TABLE _gristsys_PluginData (\n          id INTEGER PRIMARY KEY,\n          pluginId TEXT NOT NULL,\n          key TEXT NOT NULL,\n          value BLOB DEFAULT ''\n          )",
    'CREATE TABLE "_grist_ACLMemberships" (id INTEGER PRIMARY KEY, "parent" BLOB DEFAULT 0, "child" BLOB DEFAULT 0)',
    'CREATE TABLE "_grist_ACLPrincipals" (id INTEGER PRIMARY KEY, "userName" BLOB DEFAULT \'\', "groupName" BLOB DEFAULT \'\', "userEmail" BLOB DEFAULT \'\', "instanceId" BLOB DEFAULT \'\', "type" BLOB DEFAULT \'\')',
    'CREATE TABLE "_grist_ACLResources" (id INTEGER PRIMARY KEY, "colIds" BLOB DEFAULT \'\', "tableId" BLOB DEFAULT \'\')',
    'CREATE TABLE "_grist_ACLRules" (id INTEGER PRIMARY KEY, "aclFormula" BLOB DEFAULT \'\', "principals" BLOB DEFAULT \'\', "resource" BLOB DEFAULT 0, "aclColumn" BLOB DEFAULT 0, "permissions" BLOB DEFAULT 0, "aclFormulaParsed" BLOB DEFAULT \'\', "permissionsText" BLOB DEFAULT \'\', "rulePos" BLOB DEFAULT 1e999, "userAttributes" BLOB DEFAULT \'\', "memo" TEXT DEFAULT \'\')',
    'CREATE TABLE "_grist_Pages" (id INTEGER PRIMARY KEY, "viewRef" BLOB DEFAULT 0, "pagePos" BLOB DEFAULT 1e999, "indentation" BLOB DEFAULT 0, "shareRef" INTEGER DEFAULT 0, "options" TEXT DEFAULT \'\')',
    'CREATE TABLE "_grist_Triggers" (id INTEGER PRIMARY KEY, "tableRef" INTEGER DEFAULT 0, "eventTypes" TEXT DEFAULT NULL, "isReadyColRef" INTEGER DEFAULT 0, "actions" TEXT DEFAULT \'\', "memo" TEXT DEFAULT \'\', "label" TEXT DEFAULT \'\', "enabled" BOOLEAN DEFAULT 0, "watchedColRefList" TEXT DEFAULT NULL, "options" TEXT DEFAULT \'\', "condition" TEXT DEFAULT \'\')',
    'CREATE TABLE "_grist_Filters" (id INTEGER PRIMARY KEY, "viewSectionRef" INTEGER DEFAULT 0, "colRef" INTEGER DEFAULT 0, "filter" TEXT DEFAULT \'\', "pinned" BOOLEAN DEFAULT 0)',
    'CREATE TABLE "_grist_Cells" (id INTEGER PRIMARY KEY, "tableRef" INTEGER DEFAULT 0, "colRef" INTEGER DEFAULT 0, "rowId" INTEGER DEFAULT 0, "root" BOOLEAN DEFAULT 0, "parentId" INTEGER DEFAULT 0, "type" INTEGER DEFAULT 0, "content" TEXT DEFAULT \'\', "userRef" TEXT DEFAULT \'\', "timeCreated" DATETIME DEFAULT NULL, "timeUpdated" DATETIME DEFAULT NULL, "resolved" BOOLEAN DEFAULT 0)',
    'CREATE TABLE "_grist_Shares" (id INTEGER PRIMARY KEY, "linkId" TEXT DEFAULT \'\', "options" TEXT DEFAULT \'\', "label" TEXT DEFAULT \'\', "description" TEXT DEFAULT \'\')',
    'CREATE UNIQUE INDEX _gristsys_PluginData_unique_key on _gristsys_PluginData(pluginId, key)',
    'CREATE INDEX _grist_Attachments_fileIdent ON _grist_Attachments(fileIdent)',
]
