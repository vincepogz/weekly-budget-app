package com.example.data.local

import android.content.Context
import android.content.SharedPreferences

/** App-level budget options. Defaults: deposits included, transfers excluded. */
class BudgetSettings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("budget_settings", Context.MODE_PRIVATE)

    var includeDeposits: Boolean
        get() = prefs.getBoolean(KEY_INCLUDE_DEPOSITS, true)
        set(value) = prefs.edit().putBoolean(KEY_INCLUDE_DEPOSITS, value).apply()

    var includeTransfers: Boolean
        get() = prefs.getBoolean(KEY_INCLUDE_TRANSFERS, false)
        set(value) = prefs.edit().putBoolean(KEY_INCLUDE_TRANSFERS, value).apply()

    private companion object {
        const val KEY_INCLUDE_DEPOSITS = "include_deposits"
        const val KEY_INCLUDE_TRANSFERS = "include_transfers"
    }
}
