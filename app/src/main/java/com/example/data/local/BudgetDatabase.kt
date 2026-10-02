package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.data.model.*

@Database(
    entities = [
        BudgetPeriodEntity::class,
        ContributorEntity::class,
        IncomeSourceEntity::class,
        AccountEntity::class,
        ContributionAllocationEntity::class,
        BudgetItemEntity::class,
        TransactionEntity::class,
        RecurringTransactionEntity::class,
        IncomeCalculationEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class BudgetDatabase : RoomDatabase() {
    abstract fun budgetDao(): BudgetDao

    companion object {
        /**
         * v1 -> v2: transaction types become DEPOSIT / WITHDRAWAL / TRANSFER and transactions
         * gain a `cleared` flag.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transactions ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0")
                db.execSQL("UPDATE transactions SET cleared = 1")
                for (table in listOf("transactions", "recurring_transactions")) {
                    db.execSQL("UPDATE $table SET type = 'WITHDRAWAL' WHERE type = 'EXPENSE'")
                    db.execSQL("UPDATE $table SET type = 'DEPOSIT' WHERE type = 'INCOME'")
                }
            }
        }

        /**
         * v2 -> v3: introduce `income_sources` table converting legacy income1-3, and add `createdAt`
         * to transactions for tie-breaking sorts.
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS income_sources (
                        id TEXT NOT NULL PRIMARY KEY,
                        contributorId TEXT NOT NULL,
                        budgetPeriodId TEXT NOT NULL,
                        label TEXT NOT NULL,
                        weeklyAmount REAL NOT NULL
                    )
                """.trimIndent())

                db.execSQL("""
                    INSERT INTO income_sources (id, contributorId, budgetPeriodId, label, weeklyAmount)
                    SELECT id || '_inc1', id, budgetPeriodId, 'Income 1', income1 FROM contributors WHERE income1 > 0
                """.trimIndent())
                db.execSQL("""
                    INSERT INTO income_sources (id, contributorId, budgetPeriodId, label, weeklyAmount)
                    SELECT id || '_inc2', id, budgetPeriodId, 'Income 2', income2 FROM contributors WHERE income2 > 0
                """.trimIndent())
                db.execSQL("""
                    INSERT INTO income_sources (id, contributorId, budgetPeriodId, label, weeklyAmount)
                    SELECT id || '_inc3', id, budgetPeriodId, 'Income 3', income3 FROM contributors WHERE income3 > 0
                """.trimIndent())

                db.execSQL("ALTER TABLE transactions ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0")
                db.execSQL("UPDATE transactions SET createdAt = strftime('%s', 'now') * 1000")
            }
        }

        /**
         * v3 -> v4: add `note` column to contributors table.
         */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE contributors ADD COLUMN note TEXT NOT NULL DEFAULT ''")
            }
        }

        @Volatile
        private var INSTANCE: BudgetDatabase? = null

        fun getDatabase(context: Context): BudgetDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    BudgetDatabase::class.java,
                    "weekly_budget_database"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
