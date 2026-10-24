package com.handyman.marketplace.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface

private val DarkColorScheme = ColorScheme(
    background = Color(0xFF0B1120),
    surface = Color(0xFF151C2B),
    onBackground = Color(0xFFFFFFFF),
    onSurface = Color(0xFFFFFFFF),
    primary = Color(0xFF3B82F6),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF10B981),
    onSecondary = Color(0xFFFFFFFF),
    error = Color(0xFFEF4444),
    onError = Color(0xFFFFFFFF)
)

private val LightColorScheme = ColorScheme(
    background = Color(0xFFF8FAFC),
    surface = Color(0xFFFFFFFF),
    onBackground = Color(0xFF0F172A),
    onSurface = Color(0xFF0F172A),
    primary = Color(0xFF2563EB),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF059669),
    onSecondary = Color(0xFFFFFFFF),
    error = Color(0xFFDC2626),
    onError = Color(0xFFFFFFFF)
)

@Composable
fun HandymanTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
