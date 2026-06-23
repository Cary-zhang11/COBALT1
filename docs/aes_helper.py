import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.padding import PKCS7


class AesHelper:
    """AES/CBC/PKCS7 加解密工具"""

    # AES-192 (Key 24字节)
    _KEY = "k9Xm2pQ7wR4vB8nL3yT6jF0h".encode("utf-8")
    # IV 16字节
    _IV = "aZ3cE5gH8jK2mN4p".encode("utf-8")

    @classmethod
    def encrypt(cls, plain_text: str) -> str:
        """
        加密：明文 → Base64密文

        Args:
            plain_text: 明文

        Returns:
            Base64编码的密文
        """
        plain_bytes = plain_text.encode("utf-8")

        # PKCS7 填充
        padder = PKCS7(algorithms.AES.block_size).padder()
        padded_data = padder.update(plain_bytes) + padder.finalize()

        cipher = Cipher(algorithms.AES(cls._KEY), modes.CBC(cls._IV))
        encryptor = cipher.encryptor()
        cipher_bytes = encryptor.update(padded_data) + encryptor.finalize()

        return base64.b64encode(cipher_bytes).decode("utf-8")

    @classmethod
    def decrypt(cls, cipher_text: str) -> str:
        """
        解密：Base64密文 → 明文

        Args:
            cipher_text: Base64编码的密文

        Returns:
            明文
        """
        cipher_bytes = base64.b64decode(cipher_text)

        cipher = Cipher(algorithms.AES(cls._KEY), modes.CBC(cls._IV))
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(cipher_bytes) + decryptor.finalize()

        # 去除 PKCS7 填充
        unpadder = PKCS7(algorithms.AES.block_size).unpadder()
        plain_bytes = unpadder.update(padded_data) + unpadder.finalize()

        return plain_bytes.decode("utf-8")


# ===== 使用示例 =====
if __name__ == "__main__":
    original = "15222506078"

    # 加密
    encrypted = AesHelper.encrypt(original)
    print(f"密文: {encrypted}")

    # 解密
    decrypted = AesHelper.decrypt(encrypted)
    print(f"明文: {decrypted}")

    # 验证
    print("✓ 加解密一致" if original == decrypted else "✗ 不匹配")
