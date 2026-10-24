package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.handyman.marketplace.MainActivity
import com.handyman.marketplace.models.Handyman
import com.handyman.marketplace.network.ApiService
import coil.compose.rememberImagePainter
import kotlinx.coroutines.launch

@Composable
fun ClientHomeScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService
) {
    var handymen by remember { mutableStateOf<List<Handyman>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val prefs = androidx.preference.PreferenceManager.getDefaultSharedPreferences(LocalContext.current)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            try {
                val res = apiService.listHandymen("Bearer $token", null)
                if (res.isSuccessful) {
                    handymen = res.body()!!.handymen
                } else {
                    error = res.errorBody?.string() ?: "Failed to load handymen"
                }
            } catch (e: Exception) {
                error = e.message ?: "Failed to load handymen"
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Handyman Pro") },
                actions = {
                    IconButton(onClick = {}) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Icons.Default.Logout,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { navController.navigate("handyman_dashboard") },
                modifier = Modifier.padding(16.dp)
            ) {
                Icon(
                    imageVector = androidx.compose.material.icons.Icons.Default.Person,
                    contentDescription = "Become handyman"
                )
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp)
        ) {
            if (loading) {
                item { CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally)) }
            } else if (error.isNotEmpty()) {
                item { Text(text = error, color = MaterialTheme.colorScheme.error) }
            } else {
                item {
                    Text("Available Handymen", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
                }
                items(handymen) { h ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                        elevation = 2.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = h.full_name, style = MaterialTheme.typography.titleMedium)
                                Text(text = "${h.category} • ${h.experience_years} years exp", style = MaterialTheme.typography.bodySmall)
                                Text(text = "\$${h.hourly_rate}/hr • Rating: ${h.rating}", style = MaterialTheme.typography.bodySmall)
                                if (h.is_available == 1) {
                                    Text(text = "Available", style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.secondary))
                                } else {
                                    Text(text = "Busy", style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.error))
                                }
                            }
                            Button(
                                onClick = {
                                    // Navigate to a simple job creation flow - we'll create a mock job
                                    val jobId = "1" // placeholder
                                    navController.navigate("job_detail/$jobId")
                                }
                            ) { Text("Hire") }
                        }
                    }
                }
            }
        }
    }
}
