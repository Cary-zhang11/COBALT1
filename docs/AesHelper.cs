using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

/// <summary>
/// AES/CBC/PKCS7 加解密工具
/// </summary>
public static class AesHelper
{
    // AES-192 (Key 24字节)
    private static readonly byte[] Key = Encoding.UTF8.GetBytes("k9Xm2pQ7wR4vB8nL3yT6jF0h");
    // IV 16字节
    private static readonly byte[] IV = Encoding.UTF8.GetBytes("aZ3cE5gH8jK2mN4p");

    /// <summary>
    /// 加密：明文 → Base64密文
    /// </summary>
    /// <param name="plainText">明文</param>
    /// <returns>Base64编码的密文</returns>
    public static string Encrypt(string plainText)
    {
        byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
        using (Aes aes = Aes.Create())
        {
            aes.Key = Key;
            aes.IV = IV;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            using (var encryptor = aes.CreateEncryptor())
            using (var ms = new MemoryStream())
            {
                using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
                {
                    cs.Write(plainBytes, 0, plainBytes.Length);
                    cs.FlushFinalBlock();
                }
                return Convert.ToBase64String(ms.ToArray());
            }
        }
    }

    /// <summary>
    /// 解密：Base64密文 → 明文
    /// </summary>
    /// <param name="cipherText">Base64编码的密文</param>
    /// <returns>明文</returns>
    public static string Decrypt(string cipherText)
    {
        byte[] cipherBytes = Convert.FromBase64String(cipherText);
        using (Aes aes = Aes.Create())
        {
            aes.Key = Key;
            aes.IV = IV;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            using (var decryptor = aes.CreateDecryptor())
            using (var ms = new MemoryStream(cipherBytes))
            using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
            using (var sr = new StreamReader(cs, Encoding.UTF8))
            {
                return sr.ReadToEnd();
            }
        }
    }
}
