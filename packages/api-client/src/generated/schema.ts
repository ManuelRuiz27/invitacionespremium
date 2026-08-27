export type paths = {
    "/api/v1/admin/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List immutable audit records */
        get: operations["AdminAuditController_listAuditLogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminClientsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminClientsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminClientsController_update"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminClientEventsController_update"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/commercial-authorization": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminEventCommercialController_authorize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/commercial-quote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminEventCommercialController_quote"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/commercial-requote": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminEventCommercialController_requote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminInvitationDesignController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design-kickoff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminEventCommercialController_kickoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminInvitationFileAssetsController_list"];
        put?: never;
        post: operations["AdminInvitationFileAssetsController_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets/{fileAssetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AdminInvitationFileAssetsController_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets/{fileAssetId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminInvitationFileAssetsController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminInvitationDesignController_createFlipbook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminInvitationDesignController_addPage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages/{pageId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AdminInvitationDesignController_deletePage"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages/{pageId}/asset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminInvitationDesignController_replacePageAsset"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages/reorder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminInvitationDesignController_reorderPages"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminInvitationDesignController_createFlyer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer/initial-image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminInvitationDesignController_replaceFlyerInitial"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer/qr-image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminInvitationDesignController_replaceFlyerQr"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/design/readiness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminInvitationDesignController_readiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFloorplanController_get"];
        put?: never;
        post: operations["AdminFloorplanController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminFloorplanController_replaceImage"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/file-assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFloorplanFileAssetsController_list"];
        put?: never;
        post: operations["AdminFloorplanFileAssetsController_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/file-assets/{fileAssetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AdminFloorplanFileAssetsController_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/file-assets/{fileAssetId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFloorplanFileAssetsController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/lock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFloorplanController_lock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/shapes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFloorplanController_createShape"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/shapes/{shapeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AdminFloorplanController_deleteShape"];
        options?: never;
        head?: never;
        patch: operations["AdminFloorplanController_updateShape"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/floorplan/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFloorplanController_unlock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminInvitationDesignController_listHotspots"];
        put?: never;
        post: operations["AdminInvitationDesignController_createHotspot"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots/{hotspotId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AdminInvitationDesignController_deleteHotspot"];
        options?: never;
        head?: never;
        patch: operations["AdminInvitationDesignController_updateHotspot"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/events/{eventId}/pilot-observations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminPilotObservationsController_get"];
        put?: never;
        post: operations["AdminPilotObservationsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminClientsController_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/suspend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminClientsController_suspend"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminClientUsersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/users/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminClientUsersController_update"];
        trace?: never;
    };
    "/api/v1/admin/clients/{clientId}/users/planner": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminClientUsersController_createPlanner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/clients/organizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminClientsController_createOrganization"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminEventsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/events/{eventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminEventsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/events/{eventId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminEventsController_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/clients/{clientId}/assign-credits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFinanceController_assignCredits"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/clients/{clientId}/balance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFinanceController_balance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/clients/{clientId}/credit-line": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFinanceController_configureCreditLine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/clients/{clientId}/manual-payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFinanceController_manualPayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/clients/{clientId}/rebuild-balance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminFinanceController_rebuildBalance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/cuts/daily": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFinanceController_dailyCut"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/finance/cuts/monthly": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminFinanceController_monthlyCut"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminServicesPricingController_listPrices"];
        put?: never;
        post: operations["AdminServicesPricingController_createPrice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/prices/{priceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminServicesPricingController_closePrice"];
        trace?: never;
    };
    "/api/v1/admin/promotions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminServicesPricingController_listPromotions"];
        put?: never;
        post: operations["AdminServicesPricingController_createPromotion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/promotions/{promotionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminServicesPricingController_updatePromotion"];
        trace?: never;
    };
    "/api/v1/admin/promotions/{promotionId}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminServicesPricingController_activatePromotion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/promotions/{promotionId}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminServicesPricingController_deactivatePromotion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminReportsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/reports/events/{eventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AdminReportsController_listEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AdminServicesPricingController_createService"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/services/{serviceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AdminServicesPricingController_updateService"];
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AuthController_getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clients/{clientId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ClientsController_getOwned"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["ClientsController_updateOwned"];
        trace?: never;
    };
    "/api/v1/clients/{clientId}/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ClientUsersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clients/{clientId}/users/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["ClientUsersController_update"];
        trace?: never;
    };
    "/api/v1/clients/{clientId}/users/planner": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ClientUsersController_createPlanner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clients/register-planner": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ClientsController_registerPlanner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EventsController_list"];
        put?: never;
        post: operations["EventsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EventsController_get"];
        put?: never;
        post?: never;
        delete: operations["EventsController_remove"];
        options?: never;
        head?: never;
        patch: operations["EventsController_update"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventsController_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/album": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["AlbumsController_get"];
        put?: never;
        post: operations["AlbumsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["AlbumsController_update"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/album/photos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AlbumsController_addPhotos"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/album/photos/{photoId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["AlbumsController_deletePhoto"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/album/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AlbumsController_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/album/unpublish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["AlbumsController_unpublish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventsController_archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventsController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/check-ins/{checkInId}/revert": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["CheckInsController_revert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventsController_close"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/confirmation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["EventConfirmationController_confirmation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/confirmation/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventConfirmationController_close"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/confirmation/reopen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventConfirmationController_reopen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/contacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContactsController_listContacts"];
        put?: never;
        post: operations["ContactsController_createContact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/contacts/{contactId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["ContactsController_deleteContact"];
        options?: never;
        head?: never;
        patch: operations["ContactsController_updateContact"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/contacts/import-template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContactsController_template"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/contacts/import/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ContactsController_commitImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/contacts/import/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ContactsController_previewImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/design": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InvitationDesignController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/design/readiness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InvitationDesignController_readiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/file-assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FileAssetsController_list"];
        put?: never;
        post: operations["FileAssetsController_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/file-assets/{fileAssetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FileAssetsController_get"];
        put?: never;
        post?: never;
        delete: operations["FileAssetsController_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/file-assets/{fileAssetId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FileAssetsController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/floorplan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FloorplanController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ContactsController_listGroups"];
        put?: never;
        post: operations["ContactsController_createGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/groups/{groupId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["ContactsController_updateGroup"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/hotspots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InvitationDesignController_listHotspots"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InvitationsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations/{invitationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InvitationsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["InvitationsController_update"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations/{invitationId}/assistants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["InvitationsController_createAssistant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations/{invitationId}/assistants/{assistantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["InvitationsController_deleteAssistant"];
        options?: never;
        head?: never;
        patch: operations["InvitationsController_updateAssistant"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations/{invitationId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["InvitationsController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/invitations/{invitationId}/confirmation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["EventConfirmationController_override"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/physical-passes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PhysicalPassesController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/physical-passes/{passId}/svg": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PhysicalPassesController_svg"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/physical-passes/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PhysicalPassesController_generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reopen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["EventsController_reopen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReportsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reports/{reportId}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ReportsController_download"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reports/{reportId}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ReportsController_attach"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reports/attendance-pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ReportsController_attendance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/reports/physical-passes-pdf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ReportsController_physicalPasses"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/seating": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FloorplanController_seatingWorkspace"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/seating/{assistantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["FloorplanController_updateSeating"];
        trace?: never;
    };
    "/api/v1/events/{eventId}/seating/assign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["FloorplanController_assign"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/seating/assign-family": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["FloorplanController_assignFamily"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/seating/assign-group": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["FloorplanController_assignGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{eventId}/staff-tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["StaffTokensController_list"];
        put?: never;
        post: operations["StaffTokensController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finance/balance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FinanceController_balance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finance/movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FinanceController_movements"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finance/receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["FinanceController_receipts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["HealthController_getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/albums/{albumToken}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicAlbumsController_resolve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/albums/{albumToken}/photos/{photoId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicAlbumsController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicRsvpController_resolve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}/assets/{fileAssetId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicRsvpController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}/assistants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["PublicRsvpController_assistants"];
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PublicRsvpController_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}/qr.svg": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicRsvpController_qrSvg"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/invitations/{invitationToken}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PublicRsvpController_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/public/pricing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PublicPricingController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/check-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ScannerController_checkIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/floorplan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ScannerFloorplanController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/floorplan/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ScannerFloorplanController_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/physical-passes/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ScannerPhysicalPassesController_scan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ScannerController_scan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ScannerController_search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scanner/{staffToken}/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ScannerSessionController_session"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ServicesPricingController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        AddAlbumPhotosRequestDto: {
            fileAssetIds: string[];
        };
        AddFlipbookPageRequestDto: {
            /** Format: uuid */
            fileAssetId: string;
        };
        AdministrativeInvitationFileAssetUploadRequestDto: {
            /** Format: binary */
            file: string;
            /** @enum {string} */
            fileType: "FLYER_INITIAL_IMAGE" | "FLYER_QR_IMAGE" | "FLIPBOOK_PAGE_IMAGE";
        };
        AdminReportListItemDto: {
            /** Format: uuid */
            clientId: string;
            /** Format: date-time */
            detailedUntil: string;
            downloadPath?: string;
            /** Format: uuid */
            eventId: string;
            /** Format: date-time */
            expiredAt?: string | null;
            /** Format: date-time */
            generatedAtSnapshot: string;
            /** Format: date-time */
            hiddenAt?: string | null;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            privacyMode: "DETAILED" | "AGGREGATE";
            /** Format: date-time */
            readyAt?: string | null;
            /** Format: uuid */
            requestedByUserId: string;
            /** Format: date-time */
            retentionUntil: string;
            /** @enum {string} */
            status: "AUTHORIZED" | "READY" | "HIDDEN" | "EXPIRED";
            templateVersion: number;
            /** @enum {string} */
            type: "ATTENDANCE" | "PHYSICAL_PASSES";
        };
        AlbumExternalButtonDto: {
            /** @example Ver video */
            label: string;
            /** @example https://example.com/video */
            url: string;
        };
        AlbumPhotoResponseDto: {
            contentPath: string;
            /** Format: uuid */
            id: string;
            position: number;
        };
        AlbumPublicationResponseDto: {
            /** Format: uuid */
            albumId: string;
            eligibleInvitationCount: number;
            /** Format: uuid */
            eventId: string;
            /** Format: date-time */
            expiresAt?: string | null;
            photoCount: number;
            /** Format: date-time */
            publishedAt?: string | null;
            /** @enum {string} */
            status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
        };
        AlbumResponseDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: date-time */
            expiresAt?: string | null;
            externalButton?: components["schemas"]["AlbumExternalButtonDto"] | null;
            /** Format: uuid */
            id: string;
            photos: components["schemas"]["AlbumPhotoResponseDto"][];
            /** Format: date-time */
            publishedAt?: string | null;
            /** @enum {string} */
            status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
            thankYouMessage?: string | null;
            theme: components["schemas"]["AlbumThemeDto"];
            title: string;
            /** Format: date-time */
            updatedAt: string;
        };
        AlbumThemeDto: {
            /** @example #C5A46D */
            accentColor: string;
            /** @example #FFFFFF */
            backgroundColor: string;
            /** @example #111111 */
            textColor: string;
        };
        AssignCreditsRequestDto: {
            credits: number;
            notes?: string | null;
            operationReference?: string;
            reason: string;
        };
        AssignFamilyRequestDto: {
            /** Format: uuid */
            invitationId: string;
            /** Format: uuid */
            tableShapeId: string;
        };
        AssignGroupRequestDto: {
            /** Format: uuid */
            groupId: string;
            /** Format: uuid */
            tableShapeId: string;
        };
        AssignSeatingRequestDto: {
            assistantIds: string[];
            /** Format: uuid */
            tableShapeId: string;
        };
        AssistantRequestDto: {
            /** @example María Ejemplo */
            name: string;
        };
        AssistantResponseDto: {
            /** Format: date-time */
            anonymizedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            invitationId: string;
            isPrimary: boolean;
            name: string | null;
            /** @enum {string} */
            responseStatus: "PENDING" | "CONFIRMED" | "REJECTED";
            /** Format: date-time */
            updatedAt: string;
        };
        AuditLogPageResponseDto: {
            items: components["schemas"]["AuditLogResponseDto"][];
            nextCursor: string | null;
        };
        AuditLogResponseDto: {
            action: string;
            actorFingerprint: string | null;
            /** Format: uuid */
            actorId: string | null;
            /** @enum {string} */
            actorType: "USER" | "STAFF_TOKEN" | "PUBLIC_TOKEN" | "SYSTEM";
            afterData: ({
                [key: string]: unknown;
            } | unknown[] | string | number | boolean) | null;
            beforeData: ({
                [key: string]: unknown;
            } | unknown[] | string | number | boolean) | null;
            /** Format: uuid */
            clientId: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string | null;
            /** Format: uuid */
            id: string;
            metadata: ({
                [key: string]: unknown;
            } | unknown[] | string | number | boolean) | null;
            /** Format: uuid */
            operationId: string | null;
            /** Format: uuid */
            resourceId: string | null;
            resourceType: string;
        };
        AuthUserDto: {
            /** Format: uuid */
            clientId: string | null;
            /** @enum {string|null} */
            clientStatus: "ACTIVE" | "SUSPENDED" | null;
            /** @enum {string|null} */
            clientType: "PLANNER" | "ORGANIZATION" | null;
            /** Format: email */
            email: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "PLATFORM_ADMIN" | "INDEPENDENT_PLANNER" | "ORGANIZATION_ADMIN" | "ORGANIZATION_PLANNER";
        };
        AvailableServicePriceRuleResponseDto: {
            capacityMax: number | null;
            capacityMin: number | null;
            credits: number;
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil: string | null;
            /** @enum {string|null} */
            venueTier: "ONE_TO_TWO" | "THREE_TO_FIVE" | "SIX_TO_TEN" | "ELEVEN_PLUS" | null;
        };
        AvailableServiceResponseDto: {
            /** @enum {string} */
            code: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** Format: uuid */
            id: string;
            priceRules: components["schemas"]["AvailableServicePriceRuleResponseDto"][];
        };
        BalanceReconciliationDto: {
            creditLineUsed: number;
            debtCredits: number;
            debtMxnCents: number;
            lastLedgerSequence: string | null;
            matchesLedger: boolean;
            purchasedCredits: number;
        };
        CheckedInAssistantDto: {
            /** Format: uuid */
            assistantId: string;
            /** Format: date-time */
            checkedInAt: string;
            /** Format: uuid */
            checkInId: string;
            name: string;
            table: components["schemas"]["ScannerTableDto"] | null;
        };
        CheckInRevertResponseDto: {
            /** Format: uuid */
            assistantId: string;
            /** Format: uuid */
            checkInId: string;
            /** Format: date-time */
            revertedAt: string;
            /** @enum {string} */
            status: "REVERTED";
        };
        ClientCreatedResponseDto: {
            client: components["schemas"]["ClientResponseDto"];
            user: components["schemas"]["ClientUserResponseDto"];
        };
        ClientResponseDto: {
            /** @enum {string|null} */
            commercialChannel: "STANDARD" | "PARTNER" | "VENUE" | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            id: string;
            name: string;
            /** @enum {string} */
            status: "ACTIVE" | "SUSPENDED";
            /** Format: date-time */
            suspendedAt: string | null;
            suspensionReason: string | null;
            /** @enum {string} */
            type: "PLANNER" | "ORGANIZATION";
            /** Format: date-time */
            updatedAt: string;
        };
        ClientUserResponseDto: {
            /** Format: uuid */
            clientId: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: email */
            email: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "PLATFORM_ADMIN" | "INDEPENDENT_PLANNER" | "ORGANIZATION_ADMIN" | "ORGANIZATION_PLANNER";
            /** Format: date-time */
            updatedAt: string;
        };
        ClosePriceRequestDto: {
            /** Format: date-time */
            validUntil: string;
        };
        CommercialAuthorizationRequestDto: {
            /** @enum {boolean} */
            acceptanceConfirmed: true;
        };
        CommercialCoverageResponseDto: {
            creditLineAvailableCredits: number;
            purchasedCredits: number;
            sufficient: boolean;
            totalAvailableCredits: number;
        };
        CommercialRequoteRequestDto: {
            /** @enum {boolean} */
            acceptanceConfirmed: true;
            capacity?: number;
            /** Format: uuid */
            serviceId?: string;
        };
        CommitImportRequestDto: {
            /** Format: uuid */
            previewId: string;
        };
        CommitImportResponseDto: {
            contacts: components["schemas"]["ContactResponseDto"][];
            createdContacts: number;
            createdGroups: number;
        };
        ConfigureCreditLineRequestDto: {
            /** Format: date-time */
            expiresAt?: string | null;
            limitCredits: number;
            notes?: string | null;
            operationReference?: string;
            /** @enum {string} */
            status: "ACTIVE" | "SUSPENDED";
        };
        ConfirmationStateResponseDto: {
            /** Format: date-time */
            closedAt: string | null;
            /** Format: uuid */
            closedByUserId: string | null;
            enabled: boolean;
            open: boolean;
        };
        ContactGroupResponseDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ContactResponseDto: {
            /** Format: date-time */
            anonymizedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            groupId: string | null;
            /** Format: uuid */
            id: string;
            name: string | null;
            /** Format: date-time */
            updatedAt: string;
            /** @example +525512345678 */
            whatsappPhone: string | null;
        };
        CreateAlbumRequestDto: {
            externalButton?: components["schemas"]["AlbumExternalButtonDto"] | null;
            thankYouMessage?: string | null;
            theme: components["schemas"]["AlbumThemeDto"];
            title: string;
        };
        CreateContactRequestDto: {
            /** Format: uuid */
            groupId?: string | null;
            /** @example María Ejemplo */
            name: string;
            /** @example +525512345678 */
            whatsappPhone: string;
        };
        CreatedStaffTokenResponseDto: {
            alias: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: date-time */
            expiredAt: string | null;
            /** Format: uuid */
            id: string;
            /** @example /api/v1/scanner/st1.ABC/session */
            sessionPath: string;
            /** @enum {string} */
            state: "ACTIVE" | "EXPIRED";
            token: string;
        };
        CreateEventRequestDto: {
            capacity?: number | null;
            /** @default false */
            confirmationEnabled: boolean;
            /** Format: date-time */
            eventDateTime?: string | null;
            /** @default false */
            floorplanEnabled: boolean;
            /**
             * Format: uri
             * @description Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.
             */
            giftRegistryUrl?: string | null;
            /**
             * Format: uri
             * @description Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.
             */
            locationUrl?: string | null;
            name?: string | null;
            /** Format: uuid */
            serviceId?: string | null;
            /** @enum {string|null} */
            socialType?: "WEDDING" | "QUINCEANERA" | "CORPORATE" | "BIRTHDAY" | "OTHER" | null;
            /** @example America/Mexico_City */
            timeZone?: string | null;
        };
        CreateFlyerRequestDto: {
            /** Format: uuid */
            initialAssetId: string;
            /** Format: uuid */
            qrAssetId: string;
        };
        CreateHotspotRequestDto: {
            /** @enum {string} */
            action: "RSVP" | "LOCATION" | "GIFT_REGISTRY" | "QR_AREA" | "EXTERNAL_LINK";
            /** Format: uuid */
            flipbookPageId?: string;
            height: number;
            /** @default 0 */
            priority: number;
            /** Format: uri */
            url?: string;
            /** @enum {string} */
            visualOwnerType: "FLYER" | "FLIPBOOK_PAGE";
            width: number;
            x: number;
            y: number;
        };
        CreateOrganizationRequestDto: {
            /** Format: email */
            adminEmail: string;
            /** Format: password */
            adminPassword: string;
            name: string;
        };
        CreatePlannerUserRequestDto: {
            /** Format: email */
            email: string;
            /** Format: password */
            password: string;
        };
        CreatePriceRequestDto: {
            capacityMax?: number | null;
            capacityMin?: number | null;
            /** @enum {string} */
            commercialChannel: "STANDARD" | "PARTNER" | "VENUE";
            credits: number;
            /** Format: uuid */
            serviceId: string;
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil?: string | null;
            /** @enum {string|null} */
            venueTier?: "ONE_TO_TWO" | "THREE_TO_FIVE" | "SIX_TO_TEN" | "ELEVEN_PLUS" | null;
        };
        CreatePromotionRequestDto: {
            allowsStacking: boolean;
            /** Format: uuid */
            clientId?: string | null;
            /** @enum {string|null} */
            clientType?: "PLANNER" | "ORGANIZATION" | null;
            name: string;
            /** @enum {string} */
            scope: "CREDIT_PURCHASE" | "EVENT_ACTIVATION";
            /** Format: uuid */
            serviceId?: string | null;
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil?: string | null;
        };
        CreateServiceRequestDto: {
            /** @enum {string} */
            code: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** @default true */
            isActive: boolean;
        };
        CreateStaffTokenRequestDto: {
            /** @example Acceso principal */
            alias: string;
        };
        CreditLineResponseDto: {
            /** Format: date-time */
            assignedAt: string | null;
            availableCredits: number;
            /** Format: date-time */
            expiresAt: string | null;
            limitCredits: number;
            notes: string | null;
            /** @enum {string|null} */
            status: "ACTIVE" | "SUSPENDED" | null;
            usedCredits: number;
        };
        DebtLotAllocationRequestDto: {
            credits: number;
            /** Format: uuid */
            debtLotLedgerEntryId: string;
        };
        DesignReadinessResponseDto: {
            blockers: string[];
            complete: boolean;
            /** @enum {string|null} */
            designType: "FLYER" | "FLIPBOOK" | null;
        };
        EventActivationResponseDto: {
            balance: components["schemas"]["FinanceBalanceResponseDto"];
            baseCostCredits: number;
            creditLineCreditsUsed: number;
            event: components["schemas"]["EventResponseDto"];
            finalCostCredits: number;
            movements: components["schemas"]["LedgerMovementResponseDto"][];
            promotionDiscountCredits: number;
            purchasedCreditsUsed: number;
            receipt: components["schemas"]["ReceiptResponseDto"];
        };
        EventCommercialResponseDto: {
            amountMxnCents: number;
            /** Format: date-time */
            authorizedAt: string | null;
            baseCostCredits: number;
            capacity: number;
            capacityMax: number | null;
            capacityMin: number | null;
            /** Format: uuid */
            clientId: string;
            clientName: string;
            /** @enum {string} */
            commercialChannel: "STANDARD" | "PARTNER" | "VENUE";
            coverage: components["schemas"]["CommercialCoverageResponseDto"];
            customWorkExists: boolean;
            /** Format: date-time */
            designKickoffAt: string | null;
            /** Format: uuid */
            eventId: string;
            finalCostCredits: number;
            lockedAmountMxnCents: number | null;
            lockedBaseCostCredits: number | null;
            lockedFinalCostCredits: number | null;
            lockedPromotionDiscountCredits: number | null;
            /** Format: uuid */
            lockedServicePriceId: string | null;
            lockMatchesCurrentContext: boolean;
            /** Format: date-time */
            priceLockedAt: string | null;
            promotionDiscountCredits: number;
            /** @enum {string} */
            quoteSource: "LOCKED" | "CURRENT";
            /** @enum {string} */
            serviceCode: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** Format: uuid */
            serviceId: string;
            /** Format: uuid */
            servicePriceId: string;
            /** @enum {string|null} */
            venueTier: "ONE_TO_TWO" | "THREE_TO_FIVE" | "SIX_TO_TEN" | "ELEVEN_PLUS" | null;
        };
        EventResponseDto: {
            /** Format: date-time */
            activatedAt: string | null;
            /** Format: uuid */
            activatedByUserId: string | null;
            /** Format: uuid */
            activatedServiceId: string | null;
            /** Format: uuid */
            activatedServicePriceId: string | null;
            activationIdempotencyKey: string | null;
            /** Format: uuid */
            activationReceiptId: string | null;
            baseCostCredits: number | null;
            capacity: number | null;
            /** Format: uuid */
            clientId: string;
            /** Format: date-time */
            commercialAuthorizedAt: string | null;
            commercialBaseCostCredits: number | null;
            commercialCapacitySnapshot: number | null;
            /** @enum {string|null} */
            commercialChannelSnapshot: "STANDARD" | "PARTNER" | "VENUE" | null;
            commercialFinalCostCredits: number | null;
            /** Format: date-time */
            commercialPriceLockedAt: string | null;
            commercialPromotionDiscountCredits: number | null;
            /** Format: uuid */
            commercialServicePriceId: string | null;
            commercialTermsValid: boolean;
            /** Format: date-time */
            confirmationClosedAt: string | null;
            /** Format: uuid */
            confirmationClosedByUserId: string | null;
            confirmationEnabled: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            createdByUserId: string;
            creditLineCreditsUsed: number | null;
            creditUnitValueMxnCentsSnapshot: number | null;
            /** Format: date-time */
            deletedAt: string | null;
            /** Format: date-time */
            designKickoffAt: string | null;
            /** Format: date-time */
            eventDateTime: string | null;
            finalCostCredits: number | null;
            floorplanEnabled: boolean;
            /** Format: uri */
            giftRegistryUrl: string | null;
            /** Format: uuid */
            id: string;
            /** Format: uri */
            locationUrl: string | null;
            name: string | null;
            promotionDiscountCredits: number | null;
            purchasedCreditsUsed: number | null;
            /** @enum {string|null} */
            serviceCode: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO" | null;
            /** Format: uuid */
            serviceId: string | null;
            /** @enum {string|null} */
            socialType: "WEDDING" | "QUINCEANERA" | "CORPORATE" | "BIRTHDAY" | "OTHER" | null;
            /** @enum {string} */
            status: "DRAFT" | "CONFIGURED" | "READY_TO_ACTIVATE" | "ACTIVE" | "EVENT_DAY" | "CLOSED" | "ALBUM_PUBLISHED" | "ARCHIVED" | "CANCELLED";
            timeZone: string | null;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @enum {string} */
        FileAssetOwnerType: "FLYER" | "FLIPBOOK_PAGE" | "FLOORPLAN" | "ALBUM_PHOTO" | "GENERATED_REPORT" | "INVITATION" | "PHYSICAL_PASS";
        FileAssetResponseDto: {
            /** Format: date-time */
            associatedAt?: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            deletedAt?: string | null;
            /** Format: uuid */
            eventId: string;
            fileType: components["schemas"]["FileAssetType"];
            height?: number | null;
            /** Format: uuid */
            id: string;
            mimeType: string;
            originalName: string;
            /** Format: uuid */
            ownerId?: string | null;
            ownerType: components["schemas"]["FileAssetOwnerType"];
            sizeBytes: number;
            status: components["schemas"]["FileAssetStatus"];
            storageProvider: components["schemas"]["StorageProvider"];
            /** Format: date-time */
            updatedAt: string;
            width?: number | null;
        };
        /** @enum {string} */
        FileAssetStatus: "UPLOADING" | "READY" | "FAILED" | "HIDDEN" | "DELETED";
        /** @enum {string} */
        FileAssetType: "FLYER_INITIAL_IMAGE" | "FLYER_QR_IMAGE" | "FLIPBOOK_PAGE_IMAGE" | "FLOORPLAN_IMAGE" | "ALBUM_PHOTO_IMAGE" | "GENERATED_REPORT_PDF" | "INVITATION_QR_SVG" | "PHYSICAL_PASS_QR_SVG";
        FinanceBalanceResponseDto: {
            /** Format: uuid */
            clientId: string;
            creditLine: components["schemas"]["CreditLineResponseDto"];
            debtCredits: number;
            debtMxnCents: number;
            lastLedgerSequence: string | null;
            purchasedCredits: number;
            reconciliation: components["schemas"]["BalanceReconciliationDto"];
            /** Format: date-time */
            updatedAt: string;
        };
        FinanceCutResponseDto: {
            creditsConsumed: number;
            creditsGranted: number;
            creditsLent: number;
            creditsSold: number;
            debtGeneratedCredits: number;
            debtGeneratedMxnCents: number;
            debtPaidCredits: number;
            debtPaidMxnCents: number;
            /** Format: date-time */
            from: string;
            incomeMxnCents: number;
            internalRefundCredits: number;
            pendingDebtCredits: number;
            pendingDebtMxnCents: number;
            pendingPurchasedCredits: number;
            reversalCount: number;
            /** Format: date-time */
            until: string;
        };
        FinanceMutationResponseDto: {
            balance: components["schemas"]["FinanceBalanceResponseDto"];
            movement: components["schemas"]["LedgerMovementResponseDto"] | null;
            payment: components["schemas"]["PaymentResponseDto"] | null;
            receipt: components["schemas"]["ReceiptResponseDto"];
        };
        FlipbookPageResponseDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            fileAssetId: string;
            hotspots: components["schemas"]["HotspotResponseDto"][];
            /** Format: uuid */
            id: string;
            position: number;
            /** Format: date-time */
            updatedAt: string;
        };
        FloorplanImageRequestDto: {
            /** Format: uuid */
            imageAssetId: string;
        };
        FloorplanImageResponseDto: {
            contentPath: string;
            /** Format: uuid */
            fileAssetId: string;
        };
        FloorplanResponseDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            id: string;
            image: components["schemas"]["FloorplanImageResponseDto"];
            locked: boolean;
            /** Format: date-time */
            lockedAt: string | null;
            shapes: components["schemas"]["FloorplanShapeResponseDto"][];
            /** Format: date-time */
            updatedAt: string;
        };
        FloorplanShapeRequestDto: {
            capacity: number;
            /** @enum {string} */
            geometry: "RECTANGLE" | "SQUARE" | "CIRCLE" | "POLYGON";
            height: number;
            /** @enum {string} */
            kind: "TABLE" | "DECORATIVE_ZONE";
            name: string;
            polygonPoints?: components["schemas"]["PolygonPointDto"][] | null;
            rotation: number;
            width: number;
            x: number;
            y: number;
        };
        FloorplanShapeResponseDto: {
            availableCapacity: number;
            capacity: number;
            /** @enum {string} */
            geometry: "RECTANGLE" | "SQUARE" | "CIRCLE" | "POLYGON";
            height: number;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            kind: "TABLE" | "DECORATIVE_ZONE";
            name: string;
            occupancy: number;
            polygonPoints?: components["schemas"]["PolygonPointDto"][] | null;
            rotation: number;
            width: number;
            x: number;
            y: number;
        };
        GeneratePhysicalPassesRequestDto: {
            /** @example 10 */
            quantity: number;
            /** Format: uuid */
            tableShapeId?: string | null;
        };
        GeneratePhysicalPassesResponseDto: {
            /** Format: uuid */
            eventId: string;
            firstPassNumber: number;
            /** Format: uuid */
            generationOperationId: string;
            lastPassNumber: number;
            passes: components["schemas"]["PhysicalPassResponseDto"][];
            quantity: number;
            table: components["schemas"]["PhysicalPassTableDto"] | null;
        };
        GroupRequestDto: {
            /** @example Familia */
            name: string;
        };
        HealthChecksDto: {
            api: components["schemas"]["HealthComponentDto"];
            database: components["schemas"]["HealthComponentDto"];
        };
        HealthComponentDto: {
            /** @example 3.42 */
            latencyMs?: number;
            /**
             * @example up
             * @enum {string}
             */
            status: "up";
        };
        HealthResponseDto: {
            checks: components["schemas"]["HealthChecksDto"];
            /**
             * @example invitacionespremium-api
             * @enum {string}
             */
            service: "invitacionespremium-api";
            /**
             * @example ok
             * @enum {string}
             */
            status: "ok";
            /**
             * Format: date-time
             * @example 2026-07-21T19:00:00.000Z
             */
            timestamp: string;
        };
        HotspotResponseDto: {
            /** @enum {string} */
            action: "RSVP" | "LOCATION" | "GIFT_REGISTRY" | "QR_AREA" | "EXTERNAL_LINK";
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            flipbookPageId: string | null;
            height: number;
            /** Format: uuid */
            id: string;
            priority: number;
            /** Format: date-time */
            updatedAt: string;
            url: string | null;
            /** @enum {string} */
            visualOwnerType: "FLYER" | "FLIPBOOK_PAGE";
            width: number;
            x: number;
            y: number;
        };
        ImportPreviewResponseDto: {
            /** Format: date-time */
            expiresAt: string;
            invalidRows: number;
            /** Format: uuid */
            previewId: string;
            rows: components["schemas"]["ImportPreviewRowDto"][];
            totalRows: number;
            validRows: number;
        };
        ImportPreviewRowDto: {
            errors: string[];
            group: string | null;
            /** Format: uuid */
            groupId: string | null;
            /** @enum {string} */
            groupResolution: "NONE" | "EXISTING" | "NEW";
            name: string | null;
            /** @example +525512345678 */
            normalizedPhone: string | null;
            rowNumber: number;
        };
        InvitationCancellationResponseDto: {
            /** Format: date-time */
            cancelledAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            invitationId: string;
            /** @enum {string} */
            status: "CANCELLED";
        };
        InvitationDesignResponseDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            flyerInitialAssetId: string | null;
            /** Format: uuid */
            flyerQrAssetId: string | null;
            hotspots: components["schemas"]["HotspotResponseDto"][];
            /** Format: uuid */
            id: string;
            pages: components["schemas"]["FlipbookPageResponseDto"][];
            /** @enum {string} */
            type: "FLYER" | "FLIPBOOK";
            /** Format: date-time */
            updatedAt: string;
        };
        InvitationResponseDto: {
            additionalAssistantLimit: number;
            assistants: components["schemas"]["AssistantResponseDto"][];
            /** Format: date-time */
            cancelledAt: string | null;
            /** Format: uuid */
            contactId: string;
            contactName: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            id: string;
            /** Format: uri */
            invitationLink: string;
            /** @enum {string} */
            mode: "INDIVIDUAL" | "FAMILY_NOMINAL";
            /** @enum {string} */
            responseStatus: "PENDING" | "CONFIRMED" | "REJECTED";
            /** Format: date-time */
            updatedAt: string;
        };
        LedgerMovementResponseDto: {
            allocationMetadata: Record<string, never> | null;
            cashMxnDelta: number;
            /** Format: uuid */
            clientId: string;
            /** Format: date-time */
            createdAt: string;
            creditLineUsedDelta: number;
            creditUnitValueMxnCentsSnapshot: number | null;
            currency: string;
            debtDelta: number;
            /** Format: date-time */
            dueAt: string | null;
            /** Format: uuid */
            id: string;
            metadata: Record<string, never> | null;
            /** @enum {string} */
            movementType: "CREDIT_PURCHASE" | "MANUAL_CREDIT_GRANT" | "EVENT_ACTIVATION_CHARGE" | "CREDIT_LINE_USAGE" | "DEBT_PAYMENT" | "EVENT_CREDIT_REFUND" | "LEDGER_REVERSAL" | "PROMOTION_DISCOUNT";
            operationReference: string;
            /** Format: uuid */
            paymentId: string | null;
            purchasedCreditDelta: number;
            /** Format: uuid */
            receiptId: string;
            sequence: string;
        };
        LoginRequestDto: {
            /**
             * Format: email
             * @example admin@example.com
             */
            email: string;
            /** Format: password */
            password: string;
        };
        LoginResponseDto: {
            /** Format: date-time */
            expiresAt: string;
            user: components["schemas"]["AuthUserDto"];
        };
        ManualPaymentRequestDto: {
            allocations?: components["schemas"]["DebtLotAllocationRequestDto"][];
            amountMxnCents: number;
            credits?: number;
            creditUnitValueMxnCents?: number;
            externalReference: string;
            /** @enum {string} */
            kind: "CREDIT_PURCHASE" | "DEBT_PAYMENT";
            metadata?: {
                [key: string]: unknown;
            };
            notes?: string | null;
            operationReference?: string;
        };
        PaymentResponseDto: {
            amountMxnCents: number;
            /** Format: date-time */
            approvedAt: string | null;
            currency: string;
            externalReference: string;
            /** Format: uuid */
            id: string;
            idempotencyKey: string;
            metadata: {
                [key: string]: unknown;
            } | null;
            /** @enum {string} */
            provider: "MANUAL";
            /** @enum {string} */
            status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED";
        };
        PendingAssistantDto: {
            /** Format: uuid */
            id: string;
            isPrimary: boolean;
            name: string;
            table: components["schemas"]["ScannerTableDto"] | null;
        };
        PhysicalPassResponseDto: {
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            id: string;
            passNumber: number;
            /** @enum {string} */
            status: "UNUSED" | "USED";
            table: components["schemas"]["PhysicalPassTableDto"] | null;
            usedAt: string | null;
        };
        PhysicalPassTableDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        PilotObservationJournalResponseDto: {
            observations: components["schemas"]["PilotObservationResponseDto"][];
            summary: components["schemas"]["PilotObservationSummaryDto"];
        };
        PilotObservationRequestDto: {
            /** @enum {string} */
            area: "GENERAL" | "INVITATION" | "FLOORPLAN" | "GUESTS" | "RSVP" | "SEATING" | "STAFF" | "CHECKIN" | "CLOSE_REPORT";
            /** @default 1 */
            count: number;
            durationMinutes?: number;
            /** @enum {string} */
            kind: "PREPARATION_TIME" | "INCIDENT" | "PLANNER_SUPPORT" | "LAST_MINUTE_CHANGE" | "MANUAL_WORK";
            note?: string;
        };
        PilotObservationResponseDto: {
            /** @enum {string} */
            area: "GENERAL" | "INVITATION" | "FLOORPLAN" | "GUESTS" | "RSVP" | "SEATING" | "STAFF" | "CHECKIN" | "CLOSE_REPORT";
            count: number;
            /** Format: date-time */
            createdAt: string;
            durationMinutes?: number;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            kind: "PREPARATION_TIME" | "INCIDENT" | "PLANNER_SUPPORT" | "LAST_MINUTE_CHANGE" | "MANUAL_WORK";
            note?: string;
        };
        PilotObservationSummaryDto: {
            checkinIncidents: number;
            floorplanPreparationMinutes: number;
            guestCount: number;
            incidents: number;
            invitationPreparationMinutes: number;
            lastMinuteChanges: number;
            manualWorkEntries: number;
            manualWorkMinutes: number;
            plannerSupportEntries: number;
            plannerSupportMinutes: number;
            preparationMinutesTotal: number;
            tableCount: number;
        };
        PolygonPointDto: {
            x: number;
            y: number;
        };
        PriceResponseDto: {
            capacityMax: number | null;
            capacityMin: number | null;
            /** @enum {string|null} */
            clientType: "PLANNER" | "ORGANIZATION" | null;
            /** @enum {string|null} */
            commercialChannel: "STANDARD" | "PARTNER" | "VENUE" | null;
            /** Format: date-time */
            createdAt: string;
            credits: number;
            /** Format: uuid */
            id: string;
            /** @enum {number} */
            pricingVersion: 1 | 2;
            /** @enum {string} */
            serviceCode: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** Format: uuid */
            serviceId: string;
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil: string | null;
            /** @enum {string|null} */
            venueTier: "ONE_TO_TWO" | "THREE_TO_FIVE" | "SIX_TO_TEN" | "ELEVEN_PLUS" | null;
        };
        PromotionResponseDto: {
            allowsStacking: boolean;
            /** Format: uuid */
            clientId: string | null;
            /** @enum {string|null} */
            clientType: "PLANNER" | "ORGANIZATION" | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            name: string;
            /** @enum {string} */
            scope: "CREDIT_PURCHASE" | "EVENT_ACTIVATION";
            /** Format: uuid */
            serviceId: string | null;
            /** Format: date-time */
            updatedAt: string;
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil: string | null;
        };
        PublicAlbumBodyDto: {
            /** Format: date-time */
            expiresAt: string;
            externalButton?: components["schemas"]["AlbumExternalButtonDto"] | null;
            photos: components["schemas"]["PublicAlbumPhotoDto"][];
            /** Format: date-time */
            publishedAt: string;
            thankYouMessage?: string | null;
            theme: components["schemas"]["AlbumThemeDto"];
            title: string;
        };
        PublicAlbumEventDto: {
            name: string;
        };
        PublicAlbumPhotoDto: {
            contentPath: string;
            /** Format: uuid */
            id: string;
            position: number;
        };
        PublicAlbumResponseDto: {
            album: components["schemas"]["PublicAlbumBodyDto"];
            event: components["schemas"]["PublicAlbumEventDto"];
            /** @enum {string} */
            status: "AVAILABLE";
        };
        PublicInvitationAlbumResponseDto: {
            contentPath?: string;
            message?: string;
            /** @enum {string} */
            state: "AVAILABLE" | "RESTRICTED";
        };
        PublicInvitationQrResponseDto: {
            available: boolean;
            /**
             * @description Immediately fetchable invitation-scoped QR SVG path containing the current URL-encoded token.
             * @example /api/v1/public/invitations/ip1.example/qr.svg
             */
            contentPath?: string;
        };
        PublicInvitationViewResponseDto: {
            album?: components["schemas"]["PublicInvitationAlbumResponseDto"];
            assistants?: components["schemas"]["PublicRsvpAssistantResponseDto"][];
            confirmation?: components["schemas"]["PublicRsvpConfirmationResponseDto"];
            design?: components["schemas"]["PublicRsvpDesignResponseDto"];
            /** @enum {string} */
            designType?: "FLYER" | "FLIPBOOK";
            event?: components["schemas"]["PublicRsvpEventResponseDto"];
            invitation?: components["schemas"]["PublicRsvpInvitationResponseDto"];
            message?: string;
            qr?: components["schemas"]["PublicInvitationQrResponseDto"];
            /** @enum {string} */
            status: "AVAILABLE" | "CANCELLED" | "CLOSED";
        };
        PublicPricingResponseDto: {
            /** @description Public MXN amount in cents. */
            amountMxnCents: number;
            capacityMax: number;
            capacityMin: number;
            credits: number;
            displayName: string;
            /** @enum {string} */
            serviceCode: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** Format: date-time */
            validFrom: string;
            /** Format: date-time */
            validUntil: string | null;
        };
        PublicRsvpAssetReferenceDto: {
            /**
             * @description Immediately fetchable private API path containing the current URL-encoded invitation token and asset id.
             * @example /api/v1/public/invitations/eyJraW5kIjoiSU5WSVRBVElPTiJ9/assets/2e07a475-7865-4782-9916-04dba57fb2ef/content
             */
            contentPath: string;
            /** Format: uuid */
            id: string;
        };
        PublicRsvpAssistantResponseDto: {
            /** Format: uuid */
            id: string;
            isPrimary: boolean;
            name: string;
            /** @enum {string} */
            responseStatus: "PENDING" | "CONFIRMED" | "REJECTED";
        };
        PublicRsvpConfirmationResponseDto: {
            message?: string;
            open: boolean;
        };
        PublicRsvpDesignResponseDto: {
            flyerInitialAsset?: components["schemas"]["PublicRsvpAssetReferenceDto"];
            flyerQrAsset?: components["schemas"]["PublicRsvpAssetReferenceDto"];
            hotspots: components["schemas"]["PublicRsvpHotspotResponseDto"][];
            pages: components["schemas"]["PublicRsvpPageResponseDto"][];
            /** @enum {string} */
            type: "FLYER" | "FLIPBOOK";
        };
        PublicRsvpEventResponseDto: {
            /** Format: date-time */
            eventDateTime: string;
            name: string;
            timeZone: string;
        };
        PublicRsvpHotspotResponseDto: {
            /** @enum {string} */
            action: "RSVP" | "LOCATION" | "GIFT_REGISTRY" | "QR_AREA" | "EXTERNAL_LINK";
            destination: string | null;
            /** Format: uuid */
            flipbookPageId: string | null;
            height: number;
            /** Format: uuid */
            id: string;
            priority: number;
            /** @enum {string} */
            visualOwnerType: "FLYER" | "FLIPBOOK_PAGE";
            width: number;
            x: number;
            y: number;
        };
        PublicRsvpInvitationResponseDto: {
            additionalAssistantLimit: number;
            cancelled: boolean;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            mode: "INDIVIDUAL" | "FAMILY_NOMINAL";
            /** @enum {string} */
            responseStatus: "PENDING" | "CONFIRMED" | "REJECTED";
        };
        PublicRsvpPageResponseDto: {
            asset: components["schemas"]["PublicRsvpAssetReferenceDto"];
            /** Format: uuid */
            id: string;
            position: number;
        };
        ReceiptResponseDto: {
            /** Format: uuid */
            clientId: string;
            /** Format: date-time */
            createdAt: string;
            folio: string;
            /** Format: uuid */
            id: string;
            operationReference: string;
            operationType: string;
        };
        RegisterPlannerRequestDto: {
            /** Format: email */
            email: string;
            name: string;
            /** Format: password */
            password: string;
        };
        ReorderFlipbookPagesRequestDto: {
            pageIds: string[];
        };
        ReplaceDesignAssetRequestDto: {
            /** Format: uuid */
            assetId: string;
        };
        ReportAuthorizationResponseDto: {
            dataset: Record<string, never>;
            datasetHashSha256: string;
            /** Format: date-time */
            detailedUntil: string;
            fileUploadPath?: string;
            /** Format: date-time */
            generatedAtSnapshot: string;
            parameters: Record<string, never>;
            /** @enum {string} */
            privacyMode: "DETAILED" | "AGGREGATE";
            /** Format: uuid */
            reportId: string;
            /** @enum {string} */
            reportType: "ATTENDANCE" | "PHYSICAL_PASSES";
            /** Format: date-time */
            retentionUntil: string;
            /** @enum {string} */
            status: "AUTHORIZED" | "READY" | "HIDDEN" | "EXPIRED";
            templateVersion: number;
            /** Format: date-time */
            uploadExpiresAt: string;
        };
        ReportFileUploadRequestDto: {
            datasetHashSha256: string;
            /** Format: binary */
            file: string;
            templateVersion: number;
        };
        ReportListItemDto: {
            /** Format: date-time */
            detailedUntil: string;
            downloadPath?: string;
            /** Format: date-time */
            expiredAt?: string | null;
            /** Format: date-time */
            generatedAtSnapshot: string;
            /** Format: date-time */
            hiddenAt?: string | null;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            privacyMode: "DETAILED" | "AGGREGATE";
            /** Format: date-time */
            readyAt?: string | null;
            /** Format: date-time */
            retentionUntil: string;
            /** @enum {string} */
            status: "AUTHORIZED" | "READY" | "HIDDEN" | "EXPIRED";
            templateVersion: number;
            /** @enum {string} */
            type: "ATTENDANCE" | "PHYSICAL_PASSES";
        };
        RsvpAssistantInputDto: {
            /** Format: uuid */
            id?: string;
            name: string;
        };
        RsvpAssistantsRequestDto: {
            additionalAssistants: components["schemas"]["RsvpAssistantInputDto"][];
        };
        RsvpMutationResponseDto: {
            assistants: components["schemas"]["PublicRsvpAssistantResponseDto"][];
            /** Format: uuid */
            invitationId: string;
            /** @enum {string} */
            responseStatus: "PENDING" | "CONFIRMED" | "REJECTED";
        };
        RsvpOverrideRequestDto: {
            additionalAssistants: components["schemas"]["RsvpAssistantInputDto"][];
            /** @enum {string} */
            responseStatus: "CONFIRMED" | "REJECTED";
        };
        ScannerCheckInRequestDto: {
            assistantIds: string[];
            /** Format: uuid */
            invitationId: string;
        };
        ScannerCheckInResponseDto: {
            checkedIn: components["schemas"]["CheckedInAssistantDto"][];
            /** Format: uuid */
            invitationId: string;
            remainingPendingAssistants: components["schemas"]["PendingAssistantDto"][];
            remainingPendingCount: number;
            /** @enum {string} */
            status: "CHECKED_IN";
        };
        ScannerFloorplanResponseDto: {
            contentPath: string;
            /** Format: uuid */
            floorplanId: string;
            shapes: components["schemas"]["FloorplanShapeResponseDto"][];
        };
        ScannerInvitationDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            mode: "INDIVIDUAL" | "FAMILY_NOMINAL";
        };
        ScannerInvitationResultDto: {
            checkedInCount: number;
            confirmedCount: number;
            invitation: components["schemas"]["ScannerInvitationDto"];
            pendingAssistants: components["schemas"]["PendingAssistantDto"][];
            pendingCount: number;
        };
        ScannerScanRequestDto: {
            /** @example qr1.payload.signature */
            qrToken: string;
        };
        ScannerScanResponseDto: {
            checkedInCount: number;
            confirmedCount: number;
            invitation: components["schemas"]["ScannerInvitationDto"];
            pendingAssistants: components["schemas"]["PendingAssistantDto"][];
            pendingCount: number;
            /** @enum {string} */
            status: "AVAILABLE" | "NO_PENDING";
        };
        ScannerSearchRequestDto: {
            query: string;
        };
        ScannerSearchResponseDto: {
            results: components["schemas"]["ScannerInvitationResultDto"][];
            /** @enum {string} */
            status: "MATCHES" | "NO_MATCHES";
        };
        ScannerSessionEventDto: {
            /** Format: date-time */
            eventDateTime: string;
            floorplanEnabled: boolean;
            /** Format: uuid */
            id: string;
            name: string;
            /** @enum {string} */
            status: "ACTIVE" | "EVENT_DAY";
            /** @example America/Mexico_City */
            timeZone: string;
        };
        ScannerSessionResponseDto: {
            event: components["schemas"]["ScannerSessionEventDto"];
            staff: components["schemas"]["ScannerSessionStaffDto"];
            /** @enum {string} */
            status: "AVAILABLE";
        };
        ScannerSessionStaffDto: {
            alias: string;
        };
        ScannerTableDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        ScanPhysicalPassRequestDto: {
            /** @description Opaque PHYSICAL_PASS token. */
            qrToken: string;
        };
        ScanPhysicalPassResponseDto: {
            passNumber: number;
            /** Format: uuid */
            physicalPassId: string;
            /** @enum {string} */
            status: "USED";
            table: components["schemas"]["PhysicalPassTableDto"] | null;
            usedAt: string;
        };
        SeatingChangeDto: {
            /** Format: uuid */
            assistantId: string;
            /** Format: uuid */
            fromTableId: string | null;
            /** Format: uuid */
            toTableId: string | null;
        };
        SeatingMutationResponseDto: {
            affectedTables: components["schemas"]["SeatingTableOccupancyDto"][];
            changes: components["schemas"]["SeatingChangeDto"][];
        };
        SeatingTableOccupancyDto: {
            capacity: number;
            occupancy: number;
            /** Format: uuid */
            tableId: string;
        };
        SeatingWorkspaceGroupDto: {
            assignedAssistantCount: number;
            eligibleAssistantCount: number;
            /** Format: uuid */
            id: string;
            name: string;
        };
        SeatingWorkspaceInvitationDto: {
            assignedAssistantCount: number;
            eligibleAssistantCount: number;
            /** Format: uuid */
            id: string;
        };
        SeatingWorkspaceItemDto: {
            /** Format: uuid */
            assistantId: string;
            checkedIn: boolean;
            group: components["schemas"]["SeatingWorkspaceGroupDto"] | null;
            invitation: components["schemas"]["SeatingWorkspaceInvitationDto"];
            name: string | null;
            table: components["schemas"]["SeatingWorkspaceTableDto"] | null;
        };
        SeatingWorkspacePageDto: {
            items: components["schemas"]["SeatingWorkspaceItemDto"][];
            nextCursor: string | null;
            summary: components["schemas"]["SeatingWorkspaceSummaryDto"];
        };
        SeatingWorkspaceSelectedTableDto: {
            capacity: number;
            /** Format: uuid */
            id: string;
            name: string;
            occupancy: number;
        };
        SeatingWorkspaceSummaryDto: {
            selectedTable: components["schemas"]["SeatingWorkspaceSelectedTableDto"] | null;
            unassignedCount: number;
        };
        SeatingWorkspaceTableDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        ServiceResponseDto: {
            /** @enum {string} */
            code: "FLIPBOOK" | "FLYER" | "PHYSICAL_QR" | "DEMO";
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            /** Format: date-time */
            updatedAt: string;
        };
        StaffTokenResponseDto: {
            alias: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            eventId: string;
            /** Format: date-time */
            expiredAt: string | null;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            state: "ACTIVE" | "EXPIRED";
        };
        /** @enum {string} */
        StorageProvider: "LOCAL";
        SuspendClientRequestDto: {
            reason?: string;
        };
        UpdateAdminClientRequestDto: {
            /** @enum {string|null} */
            commercialChannel?: "STANDARD" | "PARTNER" | "VENUE" | null;
            name?: string;
        };
        UpdateAlbumRequestDto: {
            externalButton?: components["schemas"]["AlbumExternalButtonDto"] | null;
            thankYouMessage?: string | null;
            theme?: components["schemas"]["AlbumThemeDto"];
            title?: string;
        };
        UpdateClientRequestDto: {
            name?: string;
        };
        UpdateClientUserRequestDto: {
            /** Format: email */
            email?: string;
            /** Format: password */
            password?: string;
        };
        UpdateContactRequestDto: {
            /** Format: uuid */
            groupId?: string | null;
            /** @example María Ejemplo */
            name?: string;
            /** @example +525512345678 */
            whatsappPhone?: string;
        };
        UpdateEventRequestDto: {
            capacity?: number | null;
            /** @default false */
            confirmationEnabled: boolean;
            /** Format: date-time */
            eventDateTime?: string | null;
            /** @default false */
            floorplanEnabled: boolean;
            /**
             * Format: uri
             * @description Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.
             */
            giftRegistryUrl?: string | null;
            /**
             * Format: uri
             * @description Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.
             */
            locationUrl?: string | null;
            name?: string | null;
            /** @description Explicit consent to soft-reset an incompatible active invitation design when switching between Flyer and Flipbook before activation. */
            resetInvitationDesign?: boolean;
            /** Format: uuid */
            serviceId?: string | null;
            /** @enum {string|null} */
            socialType?: "WEDDING" | "QUINCEANERA" | "CORPORATE" | "BIRTHDAY" | "OTHER" | null;
            /** @example America/Mexico_City */
            timeZone?: string | null;
        };
        UpdateFloorplanShapeRequestDto: {
            capacity?: number;
            /** @enum {string} */
            geometry?: "RECTANGLE" | "SQUARE" | "CIRCLE" | "POLYGON";
            height?: number;
            /** @enum {string} */
            kind?: "TABLE" | "DECORATIVE_ZONE";
            name?: string;
            polygonPoints?: components["schemas"]["PolygonPointDto"][] | null;
            rotation?: number;
            width?: number;
            x?: number;
            y?: number;
        };
        UpdateHotspotRequestDto: {
            /** @enum {string} */
            action?: "RSVP" | "LOCATION" | "GIFT_REGISTRY" | "QR_AREA" | "EXTERNAL_LINK";
            height?: number;
            priority?: number;
            /** Format: uri */
            url?: string;
            width?: number;
            x?: number;
            y?: number;
        };
        UpdateInvitationRequestDto: {
            additionalAssistantLimit?: number;
            /** @enum {string} */
            mode?: "INDIVIDUAL" | "FAMILY_NOMINAL";
        };
        UpdatePromotionRequestDto: {
            allowsStacking?: boolean;
            /** Format: uuid */
            clientId?: string | null;
            /** @enum {string|null} */
            clientType?: "PLANNER" | "ORGANIZATION" | null;
            name?: string;
            /** @enum {string} */
            scope?: "CREDIT_PURCHASE" | "EVENT_ACTIVATION";
            /** Format: uuid */
            serviceId?: string | null;
            /** Format: date-time */
            validFrom?: string;
            /** Format: date-time */
            validUntil?: string | null;
        };
        UpdateSeatingRequestDto: {
            /** Format: uuid */
            tableShapeId: string | null;
        };
        UpdateServiceRequestDto: {
            isActive: boolean;
        };
        UploadFileAssetRequestDto: {
            /** Format: binary */
            file: string;
            fileType: components["schemas"]["FileAssetType"];
            ownerType: components["schemas"]["FileAssetOwnerType"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    AdminAuditController_listAuditLogs: {
        parameters: {
            query?: {
                action?: string;
                actorId?: string;
                actorType?: "USER" | "STAFF_TOKEN" | "PUBLIC_TOKEN" | "SYSTEM";
                clientId?: string;
                createdFrom?: string;
                createdTo?: string;
                cursor?: string;
                eventId?: string;
                limit?: number;
                operationId?: string;
                resourceId?: string;
                resourceType?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditLogPageResponseDto"];
                };
            };
        };
    };
    AdminClientsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"][];
                };
            };
        };
    };
    AdminClientsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    AdminClientsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAdminClientRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    AdminClientEventsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateEventRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    AdminEventCommercialController_authorize: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommercialAuthorizationRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventCommercialResponseDto"];
                };
            };
        };
    };
    AdminEventCommercialController_quote: {
        parameters: {
            query?: {
                capacity?: number;
                serviceId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventCommercialResponseDto"];
                };
            };
        };
    };
    AdminEventCommercialController_requote: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommercialRequoteRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventCommercialResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminEventCommercialController_kickoff: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventCommercialResponseDto"];
                };
            };
        };
    };
    AdminInvitationFileAssetsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"][];
                };
            };
        };
    };
    AdminInvitationFileAssetsController_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["AdministrativeInvitationFileAssetUploadRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"];
                };
            };
        };
    };
    AdminInvitationFileAssetsController_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminInvitationFileAssetsController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized private Invitation image content. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminInvitationDesignController_createFlipbook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_addPage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddFlipbookPageRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_deletePage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_replacePageAsset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplaceDesignAssetRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_reorderPages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReorderFlipbookPagesRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_createFlyer: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateFlyerRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_replaceFlyerInitial: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplaceDesignAssetRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_replaceFlyerQr: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplaceDesignAssetRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_readiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DesignReadinessResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FloorplanImageRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_replaceImage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FloorplanImageRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    AdminFloorplanFileAssetsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"][];
                };
            };
        };
    };
    AdminFloorplanFileAssetsController_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"];
                };
            };
        };
    };
    AdminFloorplanFileAssetsController_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminFloorplanFileAssetsController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized private Floorplan image content. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminFloorplanController_lock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_createShape: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FloorplanShapeRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanShapeResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_deleteShape: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminFloorplanController_updateShape: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateFloorplanShapeRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanShapeResponseDto"];
                };
            };
        };
    };
    AdminFloorplanController_unlock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_listHotspots: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HotspotResponseDto"][];
                };
            };
        };
    };
    AdminInvitationDesignController_createHotspot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateHotspotRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HotspotResponseDto"];
                };
            };
        };
    };
    AdminInvitationDesignController_deleteHotspot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AdminInvitationDesignController_updateHotspot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateHotspotRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HotspotResponseDto"];
                };
            };
        };
    };
    AdminPilotObservationsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PilotObservationJournalResponseDto"];
                };
            };
        };
    };
    AdminPilotObservationsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PilotObservationRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PilotObservationResponseDto"];
                };
            };
        };
    };
    AdminClientsController_restore: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    AdminClientsController_suspend: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SuspendClientRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    AdminClientUsersController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"][];
                };
            };
        };
    };
    AdminClientUsersController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateClientUserRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"];
                };
            };
        };
    };
    AdminClientUsersController_createPlanner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePlannerUserRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"];
                };
            };
        };
    };
    AdminClientsController_createOrganization: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrganizationRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientCreatedResponseDto"];
                };
            };
        };
    };
    AdminEventsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"][];
                };
            };
        };
    };
    AdminEventsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    AdminEventsController_restore: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_assignCredits: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignCreditsRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceMutationResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_balance: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceBalanceResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_configureCreditLine: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfigureCreditLineRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceMutationResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_manualPayment: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualPaymentRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceMutationResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_rebuildBalance: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceMutationResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_dailyCut: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceCutResponseDto"];
                };
            };
        };
    };
    AdminFinanceController_monthlyCut: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceCutResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_listPrices: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceResponseDto"][];
                };
            };
        };
    };
    AdminServicesPricingController_createPrice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePriceRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_closePrice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClosePriceRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_listPromotions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromotionResponseDto"][];
                };
            };
        };
    };
    AdminServicesPricingController_createPromotion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePromotionRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromotionResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_updatePromotion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdatePromotionRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromotionResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_activatePromotion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromotionResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_deactivatePromotion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromotionResponseDto"];
                };
            };
        };
    };
    AdminReportsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminReportListItemDto"][];
                };
            };
        };
    };
    AdminReportsController_listEvent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminReportListItemDto"][];
                };
            };
        };
    };
    AdminServicesPricingController_createService: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateServiceRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceResponseDto"];
                };
            };
        };
    };
    AdminServicesPricingController_updateService: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateServiceRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceResponseDto"];
                };
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponseDto"];
                };
            };
            /** @description Invalid email or password. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session revoked. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthUserDto"];
                };
            };
        };
    };
    ClientsController_getOwned: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    ClientsController_updateOwned: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateClientRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientResponseDto"];
                };
            };
        };
    };
    ClientUsersController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"][];
                };
            };
        };
    };
    ClientUsersController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateClientUserRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"];
                };
            };
        };
    };
    ClientUsersController_createPlanner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePlannerUserRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientUserResponseDto"];
                };
            };
        };
    };
    ClientsController_registerPlanner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterPlannerRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientCreatedResponseDto"];
                };
            };
        };
    };
    EventsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"][];
                };
            };
        };
    };
    EventsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEventRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    EventsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    EventsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    EventsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateEventRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    EventsController_activate: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventActivationResponseDto"];
                };
            };
        };
    };
    AlbumsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumResponseDto"];
                };
            };
        };
    };
    AlbumsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAlbumRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumResponseDto"];
                };
            };
        };
    };
    AlbumsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAlbumRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumResponseDto"];
                };
            };
        };
    };
    AlbumsController_addPhotos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddAlbumPhotosRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumResponseDto"];
                };
            };
        };
    };
    AlbumsController_deletePhoto: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AlbumsController_publish: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumPublicationResponseDto"];
                };
            };
        };
    };
    AlbumsController_unpublish: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlbumPublicationResponseDto"];
                };
            };
        };
    };
    EventsController_archive: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    EventsController_cancel: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    CheckInsController_revert: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckInRevertResponseDto"];
                };
            };
        };
    };
    EventsController_close: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    EventConfirmationController_confirmation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmationStateResponseDto"];
                };
            };
        };
    };
    EventConfirmationController_close: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmationStateResponseDto"];
                };
            };
        };
    };
    EventConfirmationController_reopen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmationStateResponseDto"];
                };
            };
        };
    };
    ContactsController_listContacts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactResponseDto"][];
                };
            };
        };
    };
    ContactsController_createContact: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateContactRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactResponseDto"];
                };
            };
        };
    };
    ContactsController_deleteContact: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ContactsController_updateContact: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateContactRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactResponseDto"];
                };
            };
        };
    };
    ContactsController_template: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description UTF-8 CSV template. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ContactsController_commitImport: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommitImportRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommitImportResponseDto"];
                };
            };
        };
    };
    ContactsController_previewImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportPreviewResponseDto"];
                };
            };
        };
    };
    InvitationDesignController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationDesignResponseDto"];
                };
            };
        };
    };
    InvitationDesignController_readiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DesignReadinessResponseDto"];
                };
            };
        };
    };
    FileAssetsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"][];
                };
            };
        };
    };
    FileAssetsController_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["UploadFileAssetRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"];
                };
            };
        };
    };
    FileAssetsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileAssetResponseDto"];
                };
            };
        };
    };
    FileAssetsController_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    FileAssetsController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized private binary content. */
            200: {
                headers: {
                    "Cache-Control"?: string;
                    "Content-Disposition"?: string;
                    "Content-Length"?: number;
                    "Content-Type"?: string;
                    ETag?: string;
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    FloorplanController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FloorplanResponseDto"];
                };
            };
        };
    };
    ContactsController_listGroups: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactGroupResponseDto"][];
                };
            };
        };
    };
    ContactsController_createGroup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactGroupResponseDto"];
                };
            };
        };
    };
    ContactsController_updateGroup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactGroupResponseDto"];
                };
            };
        };
    };
    InvitationDesignController_listHotspots: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HotspotResponseDto"][];
                };
            };
        };
    };
    InvitationsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponseDto"][];
                };
            };
        };
    };
    InvitationsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponseDto"];
                };
            };
        };
    };
    InvitationsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateInvitationRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponseDto"];
                };
            };
        };
    };
    InvitationsController_createAssistant: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssistantRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssistantResponseDto"];
                };
            };
        };
    };
    InvitationsController_deleteAssistant: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    InvitationsController_updateAssistant: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssistantRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssistantResponseDto"];
                };
            };
        };
    };
    InvitationsController_cancel: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationCancellationResponseDto"];
                };
            };
        };
    };
    EventConfirmationController_override: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RsvpOverrideRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RsvpMutationResponseDto"];
                };
            };
        };
    };
    PhysicalPassesController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhysicalPassResponseDto"][];
                };
            };
        };
    };
    PhysicalPassesController_svg: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    "Cache-Control"?: string;
                    "Content-Security-Policy"?: string;
                    ETag?: string;
                    "Referrer-Policy"?: string;
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PhysicalPassesController_generate: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeneratePhysicalPassesRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeneratePhysicalPassesResponseDto"];
                };
            };
        };
    };
    EventsController_reopen: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponseDto"];
                };
            };
        };
    };
    ReportsController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportListItemDto"][];
                };
            };
        };
    };
    ReportsController_download: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private generated report PDF. */
            200: {
                headers: {
                    "Cache-Control"?: string;
                    "Content-Disposition"?: string;
                    "Content-Length"?: number;
                    "Content-Type"?: string;
                    ETag?: string;
                    "Referrer-Policy"?: string;
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ReportsController_attach: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["ReportFileUploadRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportListItemDto"];
                };
            };
        };
    };
    ReportsController_attendance: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportAuthorizationResponseDto"];
                };
            };
        };
    };
    ReportsController_physicalPasses: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReportAuthorizationResponseDto"];
                };
            };
        };
    };
    FloorplanController_seatingWorkspace: {
        parameters: {
            query: {
                cursor?: string;
                groupId?: string;
                limit?: number;
                scope: "UNASSIGNED" | "TABLE";
                search?: string;
                tableShapeId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingWorkspacePageDto"];
                };
            };
        };
    };
    FloorplanController_updateSeating: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateSeatingRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingMutationResponseDto"];
                };
            };
        };
    };
    FloorplanController_assign: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignSeatingRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingMutationResponseDto"];
                };
            };
        };
    };
    FloorplanController_assignFamily: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignFamilyRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingMutationResponseDto"];
                };
            };
        };
    };
    FloorplanController_assignGroup: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignGroupRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatingMutationResponseDto"];
                };
            };
        };
    };
    StaffTokensController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffTokenResponseDto"][];
                };
            };
        };
    };
    StaffTokensController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateStaffTokenRequestDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedStaffTokenResponseDto"];
                };
            };
        };
    };
    FinanceController_balance: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceBalanceResponseDto"];
                };
            };
        };
    };
    FinanceController_movements: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LedgerMovementResponseDto"][];
                };
            };
        };
    };
    FinanceController_receipts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReceiptResponseDto"][];
                };
            };
        };
    };
    HealthController_getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description API and PostgreSQL are available. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponseDto"];
                };
            };
            /** @description PostgreSQL health check failed. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PublicAlbumsController_resolve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicAlbumResponseDto"];
                };
            };
        };
    };
    PublicAlbumsController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PublicRsvpController_resolve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicInvitationViewResponseDto"];
                };
            };
        };
    };
    PublicRsvpController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Private invitation-scoped design asset. */
            200: {
                headers: {
                    "Cache-Control"?: string;
                    "Content-Disposition"?: string;
                    "Content-Length"?: number;
                    "Content-Type"?: string;
                    ETag?: string;
                    "Referrer-Policy"?: string;
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    PublicRsvpController_assistants: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RsvpAssistantsRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RsvpMutationResponseDto"];
                };
            };
        };
    };
    PublicRsvpController_confirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RsvpAssistantsRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RsvpMutationResponseDto"];
                };
            };
        };
    };
    PublicRsvpController_qrSvg: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Deterministic invitation QR SVG generated on demand. */
            200: {
                headers: {
                    "Cache-Control"?: string;
                    "Content-Disposition"?: string;
                    "Content-Length"?: number;
                    "Content-Security-Policy"?: string;
                    "Content-Type"?: string;
                    ETag?: string;
                    "Referrer-Policy"?: string;
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "image/svg+xml": string;
                };
            };
        };
    };
    PublicRsvpController_reject: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RsvpMutationResponseDto"];
                };
            };
        };
    };
    PublicPricingController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPricingResponseDto"][];
                };
            };
        };
    };
    ScannerController_checkIn: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScannerCheckInRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScannerCheckInResponseDto"];
                };
            };
        };
    };
    ScannerFloorplanController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScannerFloorplanResponseDto"];
                };
            };
        };
    };
    ScannerFloorplanController_content: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ScannerPhysicalPassesController_scan: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScanPhysicalPassRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScanPhysicalPassResponseDto"];
                };
            };
        };
    };
    ScannerController_scan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScannerScanRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScannerScanResponseDto"];
                };
            };
        };
    };
    ScannerController_search: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScannerSearchRequestDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScannerSearchResponseDto"];
                };
            };
        };
    };
    ScannerSessionController_session: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScannerSessionResponseDto"];
                };
            };
            /** @description Malformed, unknown, or expired StaffToken. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ServicesPricingController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvailableServiceResponseDto"][];
                };
            };
        };
    };
}
