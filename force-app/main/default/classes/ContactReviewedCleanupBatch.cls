public with sharing class ContactReviewedCleanupBatch
    implements Database.Batchable<sObject>, Schedulable {

    private static final Integer DEFAULT_BATCH_SIZE = 200;

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            'SELECT Id FROM Contact WHERE Is_Reviewed__c = TRUE'
        );
    }

    public void execute(Database.BatchableContext bc, List<Contact> scope) {
        if (scope == null || scope.isEmpty()) {
            return;
        }
        Database.delete(scope, false);
    }

    public void finish(Database.BatchableContext bc) {
        // No-op. Add notification logic here if needed.
    }

    public void execute(SchedulableContext sc) {
        Database.executeBatch(new ContactReviewedCleanupBatch(), DEFAULT_BATCH_SIZE);
    }
}
