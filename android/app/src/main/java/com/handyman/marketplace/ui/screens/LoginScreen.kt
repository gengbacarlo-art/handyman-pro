package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.handyman.marketplace.MainActivity
import com.handyman.marketplace.network.ApiService
import com.handyman.marketplace.models.AuthRequest
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Handyman Pro", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(bottom = 8.dp))
        Text("Sign in to your account", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 24.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = androidx.compose.foundation.text.VisualTransformation.Password,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        )

        if (error.isNotEmpty()) {
            Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp))
        }

        Button(
            onClick = {
                coroutineScope.launch {
                    loading = true
                    try {
                        val res = apiService.login(AuthRequest(email = email, password = password))
                        if (res.isSuccessful) {
                            val token = res.body()!!.token
                            val role = res.body()!!.user.role
                            android.util.Log.d("Login", "Token: $token")
                            // Save token to SharedPreferences in real app
                            val prefs = androidx.preference.PreferenceManager.getDefaultSharedPreferences(LocalContext.current)
                            prefs.edit().putString("auth_token", token).putString("user_role", role).putString("user_email", email).apply()

                            when (role) {
                                "client" -> navController.navigate("client_home") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                                "handyman" -> navController.navigate("handyman_dashboard") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                                "admin" -> navController.navigate("admin_dashboard") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                            }
                        } else {
                            error = res.errorBody?.string() ?: "Login failed"
                        }
                    } catch (e: Exception) {
                        error = e.message ?: "Login failed"
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) CircularProgressIndicator() else Text("Sign In")
        }

        TextButton(
            onClick = { navController.navigate("register") },
            modifier = Modifier.padding(top = 16.dp)
        ) {
            Text("Create account")
        }
    }
}

@Composable
fun RegisterScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("client") }
    var phone by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Create Account", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(bottom = 8.dp))
        Text("Join as a client or handyman", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 24.dp))

        OutlinedTextField(
            value = fullName, onValueChange = { fullName = it },
            label = { Text("Full name") }, modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        )
        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text("Email") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.foundation.text.KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text("Password") }, visualTransformation = androidx.compose.foundation.text.VisualTransformation.Password,
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        )
        OutlinedTextField(
            value = phone, onValueChange = { phone = it },
            label = { Text("Phone") }, modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
        )

        DropdownMenu(
            expanded = true,
            onDismissRequest = {},
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        ) {
            DropdownMenuItem(
                text = { Text("Client") },
                onClick = { role = "client" }
            )
            DropdownMenuItem(
                text = { Text("Handyman") },
                onClick = { role = "handyman" }
            )
        }

        if (error.isNotEmpty()) {
            Text(text = error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp))
        }

        Button(
            onClick = {
                coroutineScope.launch {
                    loading = true
                    try {
                        val res = apiService.register(AuthRequest(
                            email = email, password = password, full_name = fullName,
                            phone = phone, role = role
                        ))
                        if (res.isSuccessful) {
                            val token = res.body()!!.token
                            val prefs = androidx.preference.PreferenceManager.getDefaultSharedPreferences(LocalContext.current)
                            prefs.edit().putString("auth_token", token).putString("user_role", role).apply()
                            when (role) {
                                "client" -> navController.navigate("client_home") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                                "handyman" -> navController.navigate("handyman_dashboard") { popUpTo(navController.graph.startDestination) { inclusive = true } }
                            }
                        } else {
                            error = res.errorBody?.string() ?: "Registration failed"
                        }
                    } catch (e: Exception) {
                        error = e.message ?: "Registration failed"
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) CircularProgressIndicator() else Text("Create Account")
        }

        TextButton(onClick = { navController.navigate("login") }, modifier = Modifier.padding(top = 16.dp)) {
            Text("Already have an account? Sign in")
        }
    }
}
